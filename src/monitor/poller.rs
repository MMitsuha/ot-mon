use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::{Config, DeviceConfig};
use crate::db::models::{DialStatusDoc, HardwareStatusDoc, PppoeStatusDoc};
use crate::db::mongo::MongoStore;
use crate::monitor::relogin;
use crate::notify::events::NotifyMessage;
use bson::DateTime;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// Key: (device_ip, line_tag)
type DisconnectCounters = HashMap<(String, String), u32>;

/// Per-device reachability state used to make device-unreachable notifications
/// edge-triggered instead of level-triggered.
enum DeviceAlertState {
    Ok,
    Unreachable { since: Instant },
}

/// Key: device_ip
type AlertStates = HashMap<String, DeviceAlertState>;

/// Immutable dependencies and config needed for a single poll round.
struct PollDeps<'a> {
    device_client: &'a DeviceClient,
    srun: &'a SrunClient,
    mongo: &'a MongoStore,
    notify_tx: &'a mpsc::Sender<NotifyMessage>,
    threshold: u32,
}

/// Mutable state threaded through successive poll rounds.
struct PollState {
    counters: DisconnectCounters,
    alert_states: AlertStates,
}

impl PollState {
    fn new() -> Self {
        Self {
            counters: HashMap::new(),
            alert_states: HashMap::new(),
        }
    }
}

async fn poll_network_status(device: &DeviceConfig, deps: &PollDeps<'_>, state: &mut PollState) {
    let status = match deps.device_client.get_pppoe_status(&device.ip).await {
        Ok(status) => status,
        Err(e) => {
            handle_poll_failure(device, e.to_string(), state, deps.notify_tx).await;
            return;
        }
    };

    // Poll succeeded: if we were previously unreachable, emit a recovery notification.
    if let Some(DeviceAlertState::Unreachable { since }) = state.alert_states.get(&device.ip) {
        let outage = since.elapsed();
        tracing::info!(
            device = %device.name,
            outage_secs = outage.as_secs(),
            "设备已恢复可达"
        );
        let _ = deps
            .notify_tx
            .send(NotifyMessage::DeviceRecovered {
                device_name: device.name.clone(),
                outage,
            })
            .await;
    }
    state
        .alert_states
        .insert(device.ip.clone(), DeviceAlertState::Ok);

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
    if let Err(e) = deps.mongo.insert_status(doc).await {
        tracing::error!(device = %device.name, error = %e, "保存状态到 MongoDB 失败");
    }

    for d in &status.multidial {
        let key = (device.ip.clone(), d.tag.clone());
        if !d.is_connected() && !d.macaddr.is_empty() {
            *state.counters.entry(key).or_insert(0) += 1;
        } else {
            state.counters.remove(&key);
        }
    }

    let lines_over_threshold: usize = status
        .multidial
        .iter()
        .filter(|d| {
            let key = (device.ip.clone(), d.tag.clone());
            state.counters.get(&key).copied().unwrap_or(0) >= deps.threshold
        })
        .count();

    if lines_over_threshold > 0 && !device.dry {
        tracing::warn!(
            device = %device.name,
            count = lines_over_threshold,
            threshold = deps.threshold,
            "断线次数达到阈值，开始批量重拨"
        );

        let detail = status
            .multidial
            .iter()
            .filter(|d| !d.is_connected() && !d.macaddr.is_empty())
            .map(|d| {
                let key = (device.ip.clone(), d.tag.clone());
                let cnt = state.counters.get(&key).copied().unwrap_or(0);
                format!(
                    "  {} ({}) [{}]: {} (连续断线 {}次)",
                    d.tag, d.macaddr, d.ipaddr, d.status, cnt
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        let _ = deps
            .notify_tx
            .send(NotifyMessage::LineDisconnected {
                device_name: device.name.clone(),
                line_count: lines_over_threshold,
                details: detail,
            })
            .await;

        let summary = relogin::relogin_disconnected(
            device,
            &status,
            deps.device_client,
            deps.srun,
            deps.mongo,
        )
        .await;

        state.counters.retain(|k, _| k.0 != device.ip);

        let _ = deps
            .notify_tx
            .send(NotifyMessage::ReloginComplete { summary })
            .await;
    }
}

/// Handles a failed `get_pppoe_status` call. Sends a `DeviceUnreachable`
/// notification only on the first failure after a reachable state — subsequent
/// consecutive failures are logged but suppressed to avoid spam.
async fn handle_poll_failure(
    device: &DeviceConfig,
    error: String,
    state: &mut PollState,
    notify_tx: &mpsc::Sender<NotifyMessage>,
) {
    let already_down = matches!(
        state.alert_states.get(&device.ip),
        Some(DeviceAlertState::Unreachable { .. })
    );

    if already_down {
        tracing::warn!(
            device = %device.name,
            error = %error,
            "获取设备状态失败 (持续不可达)"
        );
        return;
    }

    tracing::error!(device = %device.name, error = %error, "获取设备状态失败");
    state.alert_states.insert(
        device.ip.clone(),
        DeviceAlertState::Unreachable {
            since: Instant::now(),
        },
    );
    let _ = notify_tx
        .send(NotifyMessage::DeviceUnreachable {
            device_name: device.name.clone(),
            error,
        })
        .await;
}

async fn poll_hardware_status(
    device: &DeviceConfig,
    device_client: &DeviceClient,
    mongo: &MongoStore,
) {
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
}

pub async fn run_poller(
    config: Arc<Config>,
    device_client: Arc<DeviceClient>,
    srun: Arc<SrunClient>,
    mongo: Arc<MongoStore>,
    notify_tx: mpsc::Sender<NotifyMessage>,
    cancel: CancellationToken,
) {
    let interval = std::time::Duration::from_secs(config.monitor.poll_interval_secs);
    let deps = PollDeps {
        device_client: &device_client,
        srun: &srun,
        mongo: &mongo,
        notify_tx: &notify_tx,
        threshold: config.monitor.disconnect_threshold,
    };
    tracing::info!(
        interval_secs = config.monitor.poll_interval_secs,
        disconnect_threshold = deps.threshold,
        "状态轮询启动"
    );

    let mut state = PollState::new();

    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!("状态轮询已停止");
                break;
            }
            _ = tokio::time::sleep(interval) => {}
        }

        for device in &config.devices {
            poll_network_status(device, &deps, &mut state).await;
            poll_hardware_status(device, &device_client, &mongo).await;
        }
    }
}
