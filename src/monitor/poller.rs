use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::Config;
use crate::db::models::{DialStatusDoc, HardwareStatusDoc, PppoeStatusDoc};
use crate::db::mongo::MongoStore;
use crate::monitor::relogin;
use crate::notify::telegram::NotifyMessage;
use bson::DateTime;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// Key: (device_ip, line_tag)
type DisconnectCounters = HashMap<(String, String), u32>;

pub async fn run_poller(
    config: Arc<Config>,
    device_client: Arc<DeviceClient>,
    srun: Arc<SrunClient>,
    mongo: Arc<MongoStore>,
    notify_tx: mpsc::Sender<NotifyMessage>,
    cancel: CancellationToken,
) {
    let interval = std::time::Duration::from_secs(config.monitor.poll_interval_secs);
    let threshold = config.monitor.disconnect_threshold;
    tracing::info!(
        interval_secs = config.monitor.poll_interval_secs,
        disconnect_threshold = threshold,
        "状态轮询启动"
    );

    let mut counters: DisconnectCounters = HashMap::new();

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

            // 采集硬件状态
            match device_client.get_hardware_status(&device.ip).await {
                Ok(hw) => {
                    let hw_doc = HardwareStatusDoc {
                        device_ip: device.ip.clone(),
                        device_name: device.name.clone(),
                        timestamp: DateTime::now(),
                        nowtime: hw.nowtime,
                        cpu: hw.cpu,
                        mem: hw.mem,
                        disk: hw.disk,
                        io: hw.io,
                    };
                    if let Err(e) = mongo.insert_hw_status(hw_doc).await {
                        tracing::error!(device = %device.name, error = %e, "保存硬件状态到 MongoDB 失败");
                    }
                }
                Err(e) => {
                    tracing::warn!(device = %device.name, error = %e, "获取硬件状态失败");
                }
            }

            // 更新连续断线计数器
            for d in &status.multidial {
                let key = (device.ip.clone(), d.tag.clone());
                if !d.is_connected() && !d.macaddr.is_empty() {
                    *counters.entry(key).or_insert(0) += 1;
                } else {
                    counters.remove(&key);
                }
            }

            // 检测达到阈值的断线线路
            let lines_over_threshold: usize = status
                .multidial
                .iter()
                .filter(|d| {
                    let key = (device.ip.clone(), d.tag.clone());
                    counters.get(&key).copied().unwrap_or(0) >= threshold
                })
                .count();

            if lines_over_threshold > 0 && !device.dry {
                tracing::warn!(
                    device = %device.name,
                    count = lines_over_threshold,
                    threshold,
                    "断线次数达到阈值，开始批量重拨"
                );

                let detail = status
                    .multidial
                    .iter()
                    .filter(|d| !d.is_connected() && !d.macaddr.is_empty())
                    .map(|d| {
                        let key = (device.ip.clone(), d.tag.clone());
                        let cnt = counters.get(&key).copied().unwrap_or(0);
                        format!(
                            "  {} ({}) [{}]: {} (连续断线 {}次)",
                            d.tag, d.macaddr, d.ipaddr, d.status, cnt
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n");

                let _ = notify_tx
                    .send(NotifyMessage::LineDisconnected {
                        device_name: device.name.clone(),
                        line_count: lines_over_threshold,
                        details: detail,
                    })
                    .await;

                // 批量重拨
                let summary =
                    relogin::relogin_disconnected(device, &status, &device_client, &srun, &mongo)
                        .await;

                // 重拨后清除该设备的计数器
                counters.retain(|k, _| k.0 != device.ip);

                let _ = notify_tx
                    .send(NotifyMessage::ReloginComplete { summary })
                    .await;
            }
        }
    }
}
