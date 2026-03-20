use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::Config;
use crate::db::mongo::MongoStore;
use crate::monitor::relogin::{self, ReloginSummary};
use crate::notify::messages;
use std::sync::Arc;
use teloxide::prelude::*;
use teloxide::types::ParseMode;
use teloxide::utils::command::BotCommands;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub enum NotifyMessage {
    LineDisconnected {
        device_name: String,
        line_count: usize,
        details: String,
    },
    ReloginComplete {
        summary: ReloginSummary,
    },
    DailyReloginStart,
    DailyReloginComplete {
        summaries: Vec<ReloginSummary>,
    },
    Error {
        context: String,
        error: String,
    },
}

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "可用命令:")]
enum Command {
    #[command(description = "显示帮助信息")]
    Help,
    #[command(description = "查看所有设备当前 PPPoE 状态")]
    Status,
    #[command(description = "手动重拨指定设备断线, 用法: /relogin <设备名>")]
    Relogin(String),
    #[command(description = "手动触发全量重拨")]
    ReloginAll,
}

struct BotState {
    config: Arc<Config>,
    device_client: Arc<DeviceClient>,
    srun: Arc<SrunClient>,
    mongo: Arc<MongoStore>,
}

pub async fn run_telegram_bot(
    config: Arc<Config>,
    device_client: Arc<DeviceClient>,
    srun: Arc<SrunClient>,
    mongo: Arc<MongoStore>,
    mut notify_rx: mpsc::Receiver<NotifyMessage>,
    _notify_tx: mpsc::Sender<NotifyMessage>,
    cancel: CancellationToken,
) {
    let bot = Bot::new(&config.telegram.bot_token);
    let chat_id = ChatId(config.telegram.chat_id.parse::<i64>().unwrap_or(0));

    tracing::info!("Telegram bot 启动");

    let state = Arc::new(BotState {
        config: config.clone(),
        device_client: device_client.clone(),
        srun: srun.clone(),
        mongo: mongo.clone(),
    });

    // 通知发送任务
    let bot_notify = bot.clone();
    let notify_handle = tokio::spawn({
        let cancel = cancel.clone();
        async move {
            loop {
                tokio::select! {
                    _ = cancel.cancelled() => break,
                    msg = notify_rx.recv() => {
                        let Some(msg) = msg else { break };
                        let text = match &msg {
                            NotifyMessage::LineDisconnected { device_name, line_count, details } => {
                                messages::format_disconnect(device_name, *line_count, details)
                            }
                            NotifyMessage::ReloginComplete { summary } => {
                                messages::format_relogin_summary(summary)
                            }
                            NotifyMessage::DailyReloginStart => {
                                messages::format_daily_start()
                            }
                            NotifyMessage::DailyReloginComplete { summaries } => {
                                messages::format_daily_complete(summaries)
                            }
                            NotifyMessage::Error { context, error } => {
                                messages::format_error(context, error)
                            }
                        };

                        if let Err(e) = bot_notify
                            .send_message(chat_id, &text)
                            .parse_mode(ParseMode::Html)
                            .await
                        {
                            tracing::error!(error = %e, "发送 Telegram 通知失败");
                        }
                    }
                }
            }
        }
    });

    // 命令处理
    let handler = Update::filter_message()
        .filter_command::<Command>()
        .endpoint(
            |bot: Bot, msg: Message, cmd: Command, state: Arc<BotState>| async move {
                let chat = msg.chat.id;
                match cmd {
                    Command::Help => {
                        bot.send_message(chat, Command::descriptions().to_string())
                            .await?;
                    }
                    Command::Status => {
                        handle_status(&bot, chat, &state).await;
                    }
                    Command::Relogin(name) => {
                        handle_relogin(&bot, chat, &state, &name).await;
                    }
                    Command::ReloginAll => {
                        handle_relogin_all(&bot, chat, &state).await;
                    }
                }
                Ok::<(), teloxide::RequestError>(())
            },
        );

    let mut dispatcher = Dispatcher::builder(bot, handler)
        .dependencies(dptree::deps![state])
        .default_handler(|_| async {})
        .build();

    tokio::select! {
        _ = cancel.cancelled() => {
            dispatcher.shutdown_token().shutdown().expect("关闭 dispatcher").await;
        }
        _ = dispatcher.dispatch() => {}
    }

    notify_handle.abort();
    tracing::info!("Telegram bot 已停止");
}

async fn handle_status(bot: &Bot, chat: ChatId, state: &BotState) {
    let mut statuses = Vec::new();
    for device in &state.config.devices {
        match state.device_client.get_pppoe_status(&device.ip).await {
            Ok(status) => statuses.push((device.name.clone(), status)),
            Err(e) => {
                let _ = bot
                    .send_message(chat, format!("⚠️ 获取 {} 状态失败: {e}", device.name))
                    .await;
            }
        }
    }
    if !statuses.is_empty() {
        let reports = messages::format_status_report(&statuses);
        for report in reports {
            let _ = bot
                .send_message(chat, report)
                .parse_mode(ParseMode::Html)
                .await;
        }
    }
}

async fn handle_relogin(bot: &Bot, chat: ChatId, state: &BotState, device_name: &str) {
    let device = state.config.devices.iter().find(|d| d.name == device_name);
    let Some(device) = device else {
        let names: Vec<_> = state
            .config
            .devices
            .iter()
            .map(|d| d.name.as_str())
            .collect();
        let _ = bot
            .send_message(
                chat,
                format!("未找到设备 \"{device_name}\"，可用: {}", names.join(", ")),
            )
            .await;
        return;
    };

    let _ = bot
        .send_message(chat, format!("🔄 开始重拨 {} 的断线...", device.name))
        .await;

    let status = match state.device_client.get_pppoe_status(&device.ip).await {
        Ok(s) => s,
        Err(e) => {
            let _ = bot
                .send_message(chat, format!("❌ 获取状态失败: {e}"))
                .await;
            return;
        }
    };

    let summary = relogin::relogin_disconnected(
        device,
        &status,
        &state.device_client,
        &state.srun,
        &state.mongo,
    )
    .await;

    let text = messages::format_relogin_summary(&summary);
    let _ = bot
        .send_message(chat, text)
        .parse_mode(ParseMode::Html)
        .await;
}

async fn handle_relogin_all(bot: &Bot, chat: ChatId, state: &BotState) {
    let _ = bot.send_message(chat, "🔄 开始全量重拨...").await;

    let mut summaries = Vec::new();
    for device in &state.config.devices {
        let summary =
            relogin::relogin_all(device, &state.device_client, &state.srun, &state.mongo).await;
        summaries.push(summary);
    }

    let text = messages::format_daily_complete(&summaries);
    let _ = bot
        .send_message(chat, text)
        .parse_mode(ParseMode::Html)
        .await;
}
