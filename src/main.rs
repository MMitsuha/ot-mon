mod api;
mod config;
mod crypto;
mod db;
mod error;
mod monitor;
mod notify;

use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::Config;
use crate::db::mongo::MongoStore;
use crate::monitor::{poller, scheduler};
use crate::notify::telegram;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 加载配置
    let config_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("config.toml"));
    let config = Config::load(&config_path)?;

    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(&config.monitor.log_level)),
        )
        .init();

    tracing::info!(
        devices = config.devices.len(),
        poll_interval = config.monitor.poll_interval_secs,
        daily_time = %config.monitor.daily_relogin_time,
        "ot-mon 启动"
    );

    // 连接 MongoDB
    let mongo = MongoStore::connect(&config.mongodb).await?;
    mongo.ensure_indexes().await?;

    // 创建共享实例
    let config = Arc::new(config);
    let device_client = Arc::new(DeviceClient::new());
    let srun = Arc::new(SrunClient::new(&config.srun));
    let mongo = Arc::new(mongo);

    // 通知通道
    let (notify_tx, notify_rx) = mpsc::channel(256);

    // 取消令牌
    let cancel = CancellationToken::new();

    // Task 1: 状态轮询 + 自动重拨
    let poller_handle = tokio::spawn(poller::run_poller(
        config.clone(),
        device_client.clone(),
        srun.clone(),
        mongo.clone(),
        notify_tx.clone(),
        cancel.clone(),
    ));

    // Task 2: 每日定时重拨
    let scheduler_handle = tokio::spawn(scheduler::run_daily_scheduler(
        config.clone(),
        device_client.clone(),
        srun.clone(),
        mongo.clone(),
        notify_tx.clone(),
        cancel.clone(),
    ));

    // Task 3: Telegram bot
    let bot_handle = tokio::spawn(telegram::run_telegram_bot(
        config.clone(),
        device_client.clone(),
        srun.clone(),
        mongo.clone(),
        notify_rx,
        notify_tx.clone(),
        cancel.clone(),
    ));

    // 等待 Ctrl+C 或任一任务退出
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("收到 Ctrl+C，正在关闭...");
        }
        r = poller_handle => {
            tracing::error!("轮询任务异常退出: {r:?}");
        }
        r = scheduler_handle => {
            tracing::error!("调度器任务异常退出: {r:?}");
        }
        r = bot_handle => {
            tracing::error!("Telegram bot 异常退出: {r:?}");
        }
    }

    cancel.cancel();
    tracing::info!("ot-mon 已关闭");
    Ok(())
}
