use crate::api::types::{EncryptedRequest, PppoeStatusResponse};
use crate::error::{OtMonError, Result};
use reqwest::Client;
use serde::Deserialize;

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
