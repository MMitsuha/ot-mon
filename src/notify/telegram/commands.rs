use crate::monitor::relogin;
use crate::notify::messages;
use crate::notify::telegram::state::BotState;
use std::sync::Arc;
use teloxide::prelude::*;
use teloxide::types::ParseMode;
use teloxide::utils::command::BotCommands;

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "可用命令:")]
pub enum Command {
    #[command(description = "显示帮助信息")]
    Help,
    #[command(description = "查看所有设备当前 PPPoE 状态")]
    Status,
    #[command(description = "手动重拨指定设备断线, 用法: /relogin <设备名>")]
    Relogin(String),
    #[command(description = "手动触发全量重拨")]
    ReloginAll,
}

pub async fn dispatch(
    bot: Bot,
    msg: Message,
    cmd: Command,
    state: Arc<BotState>,
) -> Result<(), teloxide::RequestError> {
    let chat = msg.chat.id;
    match cmd {
        Command::Help => {
            bot.send_message(chat, Command::descriptions().to_string())
                .await?;
        }
        Command::Status => handle_status(&bot, chat, &state).await,
        Command::Relogin(name) => handle_relogin(&bot, chat, &state, &name).await,
        Command::ReloginAll => handle_relogin_all(&bot, chat, &state).await,
    }
    Ok(())
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
    let device = state
        .config
        .devices
        .iter()
        .find(|d| d.name == device_name && !d.dry);
    let Some(device) = device else {
        let names: Vec<_> = state
            .config
            .devices
            .iter()
            .filter(|d| !d.dry)
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
        if device.dry {
            continue;
        }
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
