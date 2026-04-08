mod commands;
mod sender;
mod state;

use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::Config;
use crate::db::mongo::MongoStore;
use crate::notify::events::NotifyMessage;
use commands::Command;
use state::BotState;
use std::sync::Arc;
use teloxide::prelude::*;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub async fn run_telegram_bot(
    config: Arc<Config>,
    device_client: Arc<DeviceClient>,
    srun: Arc<SrunClient>,
    mongo: Arc<MongoStore>,
    notify_rx: mpsc::Receiver<NotifyMessage>,
    cancel: CancellationToken,
) {
    let bot = Bot::new(&config.telegram.bot_token);
    let chat_id = ChatId(config.telegram.chat_id.parse::<i64>().unwrap_or(0));

    tracing::info!("Telegram bot 启动");

    let state = Arc::new(BotState {
        config,
        device_client,
        srun,
        mongo,
    });

    // 通知发送任务
    let notify_handle = tokio::spawn(sender::run(bot.clone(), chat_id, notify_rx, cancel.clone()));

    // 命令处理
    let handler = Update::filter_message()
        .filter_command::<Command>()
        .endpoint(commands::dispatch);

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
