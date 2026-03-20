use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::Config;
use crate::db::mongo::MongoStore;
use crate::monitor::relogin;
use crate::notify::telegram::NotifyMessage;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_cron_scheduler::{Job, JobScheduler};
use tokio_util::sync::CancellationToken;

pub async fn run_daily_scheduler(
    config: Arc<Config>,
    device_client: Arc<DeviceClient>,
    srun: Arc<SrunClient>,
    mongo: Arc<MongoStore>,
    notify_tx: mpsc::Sender<NotifyMessage>,
    cancel: CancellationToken,
) {
    // 解析 "HH:MM" -> cron "0 MM HH * * *"
    let cron_expr = match parse_time_to_cron(&config.monitor.daily_relogin_time) {
        Ok(expr) => expr,
        Err(e) => {
            tracing::error!(error = %e, "解析 daily_relogin_time 失败，每日重拨调度器未启动");
            return;
        }
    };

    tracing::info!(
        time = %config.monitor.daily_relogin_time,
        cron = %cron_expr,
        "每日重拨调度器启动"
    );

    let mut sched = match JobScheduler::new().await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!(error = %e, "创建调度器失败");
            return;
        }
    };

    let job = {
        let config = config.clone();
        let device_client = device_client.clone();
        let srun = srun.clone();
        let mongo = mongo.clone();
        let notify_tx = notify_tx.clone();

        match Job::new_async(cron_expr.as_str(), move |_uuid, _lock| {
            let config = config.clone();
            let device_client = device_client.clone();
            let srun = srun.clone();
            let mongo = mongo.clone();
            let notify_tx = notify_tx.clone();
            Box::pin(async move {
                tracing::info!("每日定时重拨开始");
                let _ = notify_tx.send(NotifyMessage::DailyReloginStart).await;

                let mut summaries = Vec::new();
                for device in &config.devices {
                    if device.dry {
                        continue;
                    }
                    let summary = relogin::relogin_all(device, &device_client, &srun, &mongo).await;
                    tracing::info!(
                        device = %summary.device_name,
                        replaced = summary.replaced_count,
                        total = summary.total_lines,
                        "设备全量重拨完成"
                    );
                    summaries.push(summary);
                }

                let _ = notify_tx
                    .send(NotifyMessage::DailyReloginComplete { summaries })
                    .await;
            })
        }) {
            Ok(j) => j,
            Err(e) => {
                tracing::error!(error = %e, "创建定时任务失败");
                return;
            }
        }
    };

    if let Err(e) = sched.add(job).await {
        tracing::error!(error = %e, "添加定时任务失败");
        return;
    }

    if let Err(e) = sched.start().await {
        tracing::error!(error = %e, "启动调度器失败");
        return;
    }

    // 等待取消信号
    cancel.cancelled().await;
    tracing::info!("每日重拨调度器已停止");
    if let Err(e) = sched.shutdown().await {
        tracing::warn!(error = %e, "关闭调度器失败");
    }
}

fn parse_time_to_cron(time_str: &str) -> anyhow::Result<String> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 2 {
        anyhow::bail!("时间格式错误，需要 HH:MM，实际: {time_str}");
    }
    let hour: u32 = parts[0].parse()?;
    let minute: u32 = parts[1].parse()?;
    if hour > 23 || minute > 59 {
        anyhow::bail!("时间范围错误: {time_str}");
    }
    // tokio-cron-scheduler 格式: sec min hour day month day-of-week
    Ok(format!("0 {} {} * * *", minute, hour))
}
