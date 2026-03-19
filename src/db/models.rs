use bson::DateTime;
use serde::{Deserialize, Serialize};

use crate::api::types::SrunLoginData;

#[derive(Debug, Serialize, Deserialize)]
pub struct PppoeStatusDoc {
    pub device_ip: String,
    pub device_name: String,
    pub timestamp: DateTime,
    pub connectedline: i32,
    pub totalline: i32,
    pub multidial: Vec<DialStatusDoc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DialStatusDoc {
    pub tag: String,
    pub status: String,
    pub username: String,
    pub ipaddr: String,
    pub macaddr: String,
    pub nic: String,
    pub lineid: i32,
    pub downspeed: i64,
    pub upspeed: i64,
    pub errcode: i32,
    pub errmsg: String,
    pub proto: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReloginEventDoc {
    pub device_ip: String,
    pub device_name: String,
    pub macaddr: String,
    pub lineid: i32,
    pub tag: String,
    /// "auto_disconnect" | "daily_schedule" | "manual"
    pub trigger: String,
    pub success: bool,
    pub error_msg: Option<String>,
    pub login_data: Option<SrunLoginData>,
    pub timestamp: DateTime,
}
