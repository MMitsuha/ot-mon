use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    #[serde(default)]
    pub monitor: MonitorConfig,
    pub srun: SrunConfig,
    #[serde(default)]
    pub mongodb: MongoConfig,
    pub telegram: TelegramConfig,
    #[serde(default)]
    pub devices: Vec<DeviceConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MonitorConfig {
    #[serde(default = "default_poll_interval")]
    pub poll_interval_secs: u64,
    #[serde(default)]
    pub daily_relogin_time: Option<String>,
    #[serde(default = "default_log_level")]
    pub log_level: String,
    /// 连续检测到断线多少次后才触发重拨（防止网络波动误触发）
    #[serde(default = "default_disconnect_threshold")]
    pub disconnect_threshold: u32,
}

impl Default for MonitorConfig {
    fn default() -> Self {
        Self {
            poll_interval_secs: default_poll_interval(),
            daily_relogin_time: None,
            log_level: default_log_level(),
            disconnect_threshold: default_disconnect_threshold(),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct SrunConfig {
    pub url: String,
    pub parent_interface: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct MongoConfig {
    #[serde(default = "default_mongo_uri")]
    pub uri: String,
    #[serde(default = "default_database")]
    pub database: String,
}

impl Default for MongoConfig {
    fn default() -> Self {
        Self {
            uri: default_mongo_uri(),
            database: default_database(),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct TelegramConfig {
    pub bot_token: String,
    pub chat_id: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct DeviceConfig {
    pub name: String,
    pub ip: String,
    #[serde(default = "default_dry")]
    pub dry: bool,
}

fn default_dry() -> bool {
    false
}

fn default_disconnect_threshold() -> u32 {
    1
}

fn default_poll_interval() -> u64 {
    60
}
fn default_log_level() -> String {
    "info".to_string()
}
fn default_mongo_uri() -> String {
    "mongodb://localhost:27017".to_string()
}
fn default_database() -> String {
    "ot_mon".to_string()
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let content =
            std::fs::read_to_string(path).with_context(|| format!("读取配置文件失败: {path:?}"))?;
        let config: Config =
            toml::from_str(&content).with_context(|| "解析配置文件失败".to_string())?;
        if config.devices.is_empty() {
            anyhow::bail!("配置文件中没有设备");
        }
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::MonitorConfig;

    #[test]
    fn monitor_config_defaults_daily_scheduler_to_disabled() {
        let config = MonitorConfig::default();
        assert_eq!(config.daily_relogin_time, None);
    }

    #[test]
    fn monitor_config_deserializes_missing_daily_relogin_time_as_none() {
        let config: MonitorConfig = toml::from_str("poll_interval_secs = 30").unwrap();
        assert_eq!(config.daily_relogin_time, None);
    }

    #[test]
    fn monitor_config_deserializes_daily_relogin_time_when_present() {
        let config: MonitorConfig = toml::from_str("daily_relogin_time = \"04:00\"").unwrap();
        assert_eq!(config.daily_relogin_time.as_deref(), Some("04:00"));
    }
}
