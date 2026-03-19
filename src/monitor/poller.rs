use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::Config;
use crate::db::models::{DialStatusDoc, PppoeStatusDoc};
use crate::db::mongo::MongoStore;
use crate::monitor::relogin;
use crate::notify::telegram::NotifyMessage;
use bson::DateTime;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub async fn run_poller(
    config: Arc<Config>,
    device_client: Arc<DeviceClient>,
    srun: Arc<SrunClient>,
    mongo: Arc<MongoStore>,
    notify_tx: mpsc::Sender<NotifyMessage>,
    cancel: CancellationToken,
) {
    let interval = std::time::Duration::from_secs(config.monitor.poll_interval_secs);
    tracing::info!(
        interval_secs = config.monitor.poll_interval_secs,
        "状态轮询启动"
    );

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("状态轮询已停止");
                break;
            }
            _ = tokio::time::sleep(interval) => {}
        }

        for device in &config.devices {
            let status = match device_client.get_pppoe_status(&device.ip).await {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!(device = %device.name, error = %e, "获取设备状态失败");
                    let _ = notify_tx
                        .send(NotifyMessage::Error {
                            context: format!("轮询设备 {}", device.name),
                            error: e.to_string(),
                        })
                        .await;
                    continue;
                }
            };

            // 保存到 MongoDB
            let doc = PppoeStatusDoc {
                device_ip: device.ip.clone(),
                device_name: device.name.clone(),
                timestamp: DateTime::now(),
                connectedline: status.connectedline,
                totalline: status.totalline,
                multidial: status
                    .multidial
                    .iter()
                    .map(|d| DialStatusDoc {
                        tag: d.tag.clone(),
                        status: d.status.clone(),
                        username: d.username.clone(),
                        ipaddr: d.ipaddr.clone(),
                        macaddr: d.macaddr.clone(),
                        nic: d.nic.clone(),
                        lineid: d.lineid,
                        downspeed: d.downspeed,
                        upspeed: d.upspeed,
                        errcode: d.errcode,
                        errmsg: d.errmsg.clone(),
                        proto: d.proto.clone(),
                    })
                    .collect(),
            };
            if let Err(e) = mongo.insert_status(doc).await {
                tracing::error!(device = %device.name, error = %e, "保存状态到 MongoDB 失败");
            }

            // 检测断线
            let disconnected_count = status
                .multidial
                .iter()
                .filter(|d| !d.is_connected() && !d.macaddr.is_empty())
                .count();

            if disconnected_count > 0 {
                tracing::warn!(
                    device = %device.name,
                    count = disconnected_count,
                    "检测到断线，开始批量重拨"
                );

                let detail = status
                    .multidial
                    .iter()
                    .filter(|d| !d.is_connected() && !d.macaddr.is_empty())
                    .map(|d| format!("  {} ({}) [{}]: {}", d.tag, d.macaddr, d.ipaddr, d.status))
                    .collect::<Vec<_>>()
                    .join("\n");

                let _ = notify_tx
                    .send(NotifyMessage::LineDisconnected {
                        device_name: device.name.clone(),
                        line_count: disconnected_count,
                        details: detail,
                    })
                    .await;

                // 批量重拨
                let summary = relogin::relogin_disconnected(
                    device,
                    &status,
                    &device_client,
                    &srun,
                    &mongo,
                )
                .await;

                let _ = notify_tx
                    .send(NotifyMessage::ReloginComplete { summary })
                    .await;
            }
        }
    }
}
