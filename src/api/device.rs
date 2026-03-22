use crate::api::types::{
    EncryptedRequest, HardwareStatusResponse, LoginInfoResponse, PppoeStatusResponse,
};
use crate::error::{OtMonError, Result};
use md5::{Digest, Md5};
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub struct DeviceClient {
    client: Client,
}

impl DeviceClient {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("创建 HTTP 客户端失败"),
        }
    }

    /// 获取设备 PPPoE 拨号状态
    pub async fn get_pppoe_status(&self, device_ip: &str) -> Result<PppoeStatusResponse> {
        let url = format!("http://{}:8080/v1.0/devices/multpppoe/status", device_ip);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?
            .json::<PppoeStatusResponse>()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?;
        Ok(resp)
    }

    /// 获取设备登录信息 (SN)
    pub async fn get_login_info(&self, device_ip: &str) -> Result<LoginInfoResponse> {
        let url = format!("http://{}:8080/v1.0/login_info", device_ip);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?
            .json::<LoginInfoResponse>()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?;
        Ok(resp)
    }

    /// 获取设备硬件状态 (需要 site_cookie JWT)
    pub async fn get_hardware_status(&self, device_ip: &str) -> Result<HardwareStatusResponse> {
        // 1. 获取 SN
        let login_info = self.get_login_info(device_ip).await?;
        let sn = login_info.result.map(|r| r.sn).unwrap_or_default();
        if sn.is_empty() {
            return Err(OtMonError::Config(format!(
                "设备 {} login_info 返回空 SN",
                device_ip
            )));
        }

        // 2. 生成 JWT cookie
        let cookie = generate_site_cookie(&sn)?;

        // 3. 请求硬件状态
        let url = format!("http://{}:8080/v1.0/devices/status", device_ip);
        let resp = self
            .client
            .get(&url)
            .header("Cookie", format!("site_cookie={}", cookie))
            .send()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?
            .json::<HardwareStatusResponse>()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?;
        Ok(resp)
    }

    /// 上传加密的网络配置到设备
    pub async fn set_network_config(
        &self,
        device_ip: &str,
        encrypted: &EncryptedRequest,
    ) -> Result<()> {
        let url = format!(
            "http://{}:8080/v1.0/devices/multpppoe/set_dhcp_conf",
            device_ip
        );

        #[derive(Deserialize)]
        struct SetConfResponse {
            #[serde(default)]
            code: i32,
            #[serde(default)]
            message: String,
        }

        let resp: SetConfResponse = self
            .client
            .post(&url)
            .json(encrypted)
            .send()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?
            .json()
            .await
            .map_err(|e| OtMonError::DeviceApi {
                device_ip: device_ip.to_string(),
                source: e,
            })?;

        if resp.code != 0 {
            return Err(OtMonError::Config(format!(
                "设备 {} setconf 返回错误: code={}, msg={}",
                device_ip, resp.code, resp.message
            )));
        }

        tracing::info!(device_ip, "网络配置上传成功");
        Ok(())
    }
}

/// 生成 site_cookie JWT (HS256, key="guyf131gIS2g1")
fn generate_site_cookie(sn: &str) -> Result<String> {
    use jsonwebtoken::{EncodingKey, Header, encode};

    const JWT_KEY: &[u8] = b"guyf131gIS2g1";

    // esn = MD5(SN)[:8]
    let mut hasher = Md5::new();
    hasher.update(sn.as_bytes());
    let md5_hex = format!("{:x}", hasher.finalize());
    let esn = &md5_hex[..8];

    #[derive(Serialize)]
    struct Claims {
        esn: String,
        exp: i64,
        iss: String,
    }

    let claims = Claims {
        esn: esn.to_string(),
        exp: chrono::Utc::now().timestamp() + 259200, // +3 days
        iss: "activation".to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(JWT_KEY),
    )
    .map_err(|e| OtMonError::Config(format!("JWT 生成失败: {e}")))
}
