use crate::api::types::*;
use crate::config::SrunConfig;
use crate::error::{OtMonError, Result};
use reqwest::Client;

pub struct SrunClient {
    client: Client,
    base_url: String,
    parent_interface: String,
}

impl SrunClient {
    pub fn new(config: &SrunConfig) -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("创建 HTTP 客户端失败"),
            base_url: config.url.trim_end_matches('/').to_string(),
            parent_interface: config.parent_interface.clone(),
        }
    }

    /// 使用随机账号登录 macvlan
    #[allow(dead_code)]
    pub async fn login_macvlan(&self, mac_address: &str) -> Result<SrunLoginData> {
        let url = format!("{}/api/login/macvlan", self.base_url);
        let req = SrunLoginRequest {
            parent_interface: self.parent_interface.clone(),
            mac_address: mac_address.to_string(),
        };
        let resp: SrunApiResponse<SrunLoginData> = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;
        if resp.success {
            resp.data.ok_or_else(|| OtMonError::SrunLoginFailed {
                mac: mac_address.to_string(),
                message: "响应成功但无数据".to_string(),
            })
        } else {
            Err(OtMonError::SrunLoginFailed {
                mac: mac_address.to_string(),
                message: resp.error.unwrap_or_else(|| "未知错误".to_string()),
            })
        }
    }

    /// 批量随机 MAC 登录
    pub async fn login_random(&self, count: u32) -> Result<Vec<SrunRandomLoginResult>> {
        let url = format!("{}/api/login/random", self.base_url);
        let req = SrunRandomLoginRequest {
            parent_interface: self.parent_interface.clone(),
            count,
        };
        let resp: SrunApiResponse<Vec<SrunRandomLoginResult>> = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;
        if resp.success {
            Ok(resp.data.unwrap_or_default())
        } else {
            Err(OtMonError::SrunLoginFailed {
                mac: format!("random x{count}"),
                message: resp.error.unwrap_or_else(|| "未知错误".to_string()),
            })
        }
    }

    /// 批量登录直到凑够 needed 个成功 MAC（自动重试）
    pub async fn login_random_until_success(
        &self,
        needed: u32,
        max_retries: u32,
    ) -> Result<Vec<String>> {
        let mut successful_macs = Vec::new();
        let mut remaining = needed;

        for attempt in 0..=max_retries {
            if remaining == 0 {
                break;
            }
            if attempt > 0 {
                tracing::info!(attempt, remaining, "重试批量登录");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }

            let results = self.login_random(remaining).await?;
            for r in &results {
                if r.result.is_ok() {
                    successful_macs.push(r.mac.clone());
                } else {
                    tracing::warn!(
                        mac = %r.mac,
                        error = ?r.result.as_ref().err(),
                        "批量登录中单条失败"
                    );
                }
            }

            remaining = needed - successful_macs.len() as u32;
        }

        if (successful_macs.len() as u32) < needed {
            tracing::error!(
                needed,
                got = successful_macs.len(),
                "批量登录未能凑够所需数量"
            );
        }

        Ok(successful_macs)
    }

    /// 登出 macvlan
    #[allow(dead_code)]
    pub async fn logout_macvlan(&self) -> Result<()> {
        let url = format!("{}/api/logout/macvlan", self.base_url);
        let req = SrunLogoutRequest {
            parent_interface: self.parent_interface.clone(),
        };
        let resp: SrunApiResponse<()> = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await?
            .json()
            .await?;
        if !resp.success {
            tracing::warn!(
                error = resp.error.as_deref().unwrap_or(""),
                "macvlan 登出失败"
            );
        }
        Ok(())
    }
}
