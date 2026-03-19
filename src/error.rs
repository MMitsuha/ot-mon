use thiserror::Error;

#[derive(Error, Debug)]
pub enum OtMonError {
    #[error("设备API请求失败 ({device_ip}): {source}")]
    DeviceApi {
        device_ip: String,
        source: reqwest::Error,
    },

    #[error("Srun API请求失败: {0}")]
    SrunRequest(#[from] reqwest::Error),

    #[error("Srun 登录失败 (mac={mac}): {message}")]
    SrunLoginFailed { mac: String, message: String },

    #[error("MongoDB 错误: {0}")]
    Mongo(#[from] mongodb::error::Error),

    #[error("配置错误: {0}")]
    Config(String),

    #[error("JSON 解析失败: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, OtMonError>;
