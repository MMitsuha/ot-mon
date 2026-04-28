use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::api::types::{
    NetworkLineConfig, NetworkLineEntry, NetworkLineMinimal, PppoeStatusResponse,
};
use crate::config::DeviceConfig;
use crate::crypto;
use crate::db::models::ReloginEventDoc;
use crate::db::mongo::MongoStore;
use bson::DateTime;

pub struct ReloginSummary {
    pub device_name: String,
    pub total_lines: usize,
    pub replaced_count: usize,
    pub new_macs: Vec<String>,
    pub failed_logins: usize,
    pub config_uploaded: bool,
    pub error: Option<String>,
}

/// 断线重拨: 只替换断线的线路 MAC
pub async fn relogin_disconnected(
    device: &DeviceConfig,
    status: &PppoeStatusResponse,
    device_client: &DeviceClient,
    srun: &SrunClient,
    mongo: &MongoStore,
) -> ReloginSummary {
    if device.dry {
        panic!(
            "设备 {} 配置为 dry 模式，不能执行 relogin_disconnected",
            device.name
        );
    }
    let disconnected_count = status
        .multidial
        .iter()
        .filter(|d| !d.is_connected() && !d.macaddr.is_empty())
        .count();

    if disconnected_count == 0 {
        return ReloginSummary {
            device_name: device.name.clone(),
            total_lines: status.multidial.len(),
            replaced_count: 0,
            new_macs: vec![],
            failed_logins: 0,
            config_uploaded: false,
            error: None,
        };
    }

    tracing::info!(
        device = %device.name,
        disconnected = disconnected_count,
        total = status.multidial.len(),
        "开始断线重拨"
    );

    // 批量登录获取新 MAC
    let new_macs = match srun
        .login_random_until_success(disconnected_count as u32, 3)
        .await
    {
        Ok(macs) => macs,
        Err(e) => {
            let msg = format!("批量登录失败: {e}");
            tracing::error!(device = %device.name, error = %msg);
            return ReloginSummary {
                device_name: device.name.clone(),
                total_lines: status.multidial.len(),
                replaced_count: 0,
                new_macs: vec![],
                failed_logins: disconnected_count,
                config_uploaded: false,
                error: Some(msg),
            };
        }
    };

    let failed_logins = disconnected_count - new_macs.len();

    // 构建条目: 断线且分配到新 MAC 的线路使用精简格式 (设备据此重置该线路);
    // 其余线路 (在线 / 没拿到新 MAC 的断线) 用完整格式以保留原配置。
    // 与 text2.json (修改特定线路) 的格式一致。
    let mut mac_iter = new_macs.iter();
    let entries: Vec<NetworkLineEntry> = status
        .multidial
        .iter()
        .map(|d| {
            if !d.is_connected() && !d.macaddr.is_empty() {
                if let Some(new_mac) = mac_iter.next() {
                    NetworkLineMinimal::new(&d.nic, new_mac).into()
                } else {
                    NetworkLineConfig::from_dial_status(d).into()
                }
            } else {
                NetworkLineConfig::from_dial_status(d).into()
            }
        })
        .collect();

    // 加密并上传
    let uploaded = upload_config(device, device_client, &entries).await;

    // 记录事件
    for mac in &new_macs {
        let event = ReloginEventDoc {
            device_ip: device.ip.clone(),
            device_name: device.name.clone(),
            macaddr: mac.clone(),
            lineid: -1,
            tag: String::new(),
            trigger: "auto_disconnect".to_string(),
            success: uploaded.is_ok(),
            error_msg: uploaded.as_ref().err().map(|e| e.to_string()),
            login_data: None,
            timestamp: DateTime::now(),
        };
        let _ = mongo.insert_relogin_event(event).await;
    }

    ReloginSummary {
        device_name: device.name.clone(),
        total_lines: status.multidial.len(),
        replaced_count: new_macs.len(),
        new_macs,
        failed_logins,
        config_uploaded: uploaded.is_ok(),
        error: uploaded.err().map(|e| e.to_string()),
    }
}

/// 全量重拨: 替换所有线路 MAC
pub async fn relogin_all(
    device: &DeviceConfig,
    device_client: &DeviceClient,
    srun: &SrunClient,
    mongo: &MongoStore,
) -> ReloginSummary {
    if device.dry {
        panic!("设备 {} 配置为 dry 模式，不能执行 relogin_all", device.name);
    }
    // 获取当前状态
    let status = match device_client.get_pppoe_status(&device.ip).await {
        Ok(s) => s,
        Err(e) => {
            return ReloginSummary {
                device_name: device.name.clone(),
                total_lines: 0,
                replaced_count: 0,
                new_macs: vec![],
                failed_logins: 0,
                config_uploaded: false,
                error: Some(format!("获取状态失败: {e}")),
            };
        }
    };

    let total = status.multidial.len();
    if total == 0 {
        return ReloginSummary {
            device_name: device.name.clone(),
            total_lines: 0,
            replaced_count: 0,
            new_macs: vec![],
            failed_logins: 0,
            config_uploaded: false,
            error: Some("设备没有线路".to_string()),
        };
    }

    tracing::info!(
        device = %device.name,
        total,
        "开始全量重拨"
    );

    // 批量登录获取 total 个新 MAC
    let new_macs = match srun.login_random_until_success(total as u32, 3).await {
        Ok(macs) => macs,
        Err(e) => {
            let msg = format!("批量登录失败: {e}");
            tracing::error!(device = %device.name, error = %msg);
            return ReloginSummary {
                device_name: device.name.clone(),
                total_lines: total,
                replaced_count: 0,
                new_macs: vec![],
                failed_logins: total,
                config_uploaded: false,
                error: Some(msg),
            };
        }
    };

    let failed_logins = total - new_macs.len();

    // 构建全新配置: 全部条目使用精简格式 (与 text.json "上传全新配置" 一致)
    let nic = status
        .multidial
        .first()
        .map(|d| d.nic.as_str())
        .unwrap_or("eth1");

    let entries: Vec<NetworkLineEntry> = new_macs
        .iter()
        .map(|mac| NetworkLineMinimal::new(nic, mac).into())
        .collect();

    // 加密并上传
    let uploaded = upload_config(device, device_client, &entries).await;

    // 记录事件
    for mac in &new_macs {
        let event = ReloginEventDoc {
            device_ip: device.ip.clone(),
            device_name: device.name.clone(),
            macaddr: mac.clone(),
            lineid: -1,
            tag: String::new(),
            trigger: "daily_schedule".to_string(),
            success: uploaded.is_ok(),
            error_msg: uploaded.as_ref().err().map(|e| e.to_string()),
            login_data: None,
            timestamp: DateTime::now(),
        };
        let _ = mongo.insert_relogin_event(event).await;
    }

    ReloginSummary {
        device_name: device.name.clone(),
        total_lines: total,
        replaced_count: new_macs.len(),
        new_macs,
        failed_logins,
        config_uploaded: uploaded.is_ok(),
        error: uploaded.err().map(|e| e.to_string()),
    }
}

/// 加密配置并上传到设备
async fn upload_config(
    device: &DeviceConfig,
    device_client: &DeviceClient,
    entries: &[NetworkLineEntry],
) -> crate::error::Result<()> {
    let encrypted = crypto::encrypt_request(entries)?;
    device_client
        .set_network_config(&device.ip, &encrypted)
        .await?;
    tracing::info!(device = %device.name, lines = entries.len(), "配置已上传");
    Ok(())
}
