use serde::{Deserialize, Serialize};

// ---- 设备 PPPoE 状态响应 ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PppoeStatusResponse {
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub sn: String,
    #[serde(default)]
    pub forwarding: bool,
    #[serde(default)]
    pub runmode: String,
    #[serde(default)]
    pub errcode: i32,
    #[serde(default)]
    pub totalline: i32,
    #[serde(default)]
    pub convergeline: i32,
    #[serde(default)]
    pub connectedline: i32,
    #[serde(default)]
    pub errmsg: String,
    #[serde(default)]
    pub ipv6: String,
    #[serde(default)]
    pub recordtime: i64,
    #[serde(default)]
    pub redialtime: String,
    #[serde(default)]
    pub multidial: Vec<DialStatus>,
    #[serde(default)]
    pub trafficmode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DialStatus {
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub proto: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub vlanid: i32,
    #[serde(default)]
    pub bandwidth: i32,
    #[serde(default)]
    pub dialnumber: i32,
    #[serde(default)]
    pub nic: String,
    #[serde(default)]
    pub macaddr: String,
    #[serde(default)]
    pub macconf: String,
    #[serde(default)]
    pub ipaddr: String,
    #[serde(default)]
    pub netmask: String,
    #[serde(default)]
    pub gateway: String,
    #[serde(default)]
    pub disable: bool,
    #[serde(default)]
    pub dns1: String,
    #[serde(default)]
    pub dns2: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub statustime: i64,
    #[serde(default)]
    pub errcode: i32,
    #[serde(default)]
    pub errmsg: String,
    #[serde(default)]
    pub upspeed: i64,
    #[serde(default)]
    pub downspeed: i64,
    #[serde(default)]
    pub sentbytes: String,
    #[serde(default)]
    pub recvbytes: String,
    #[serde(default)]
    pub logicnic: String,
    #[serde(default)]
    pub practicnic: String,
    #[serde(default)]
    pub updatetime: i64,
    #[serde(default)]
    pub lineid: i32,
    #[serde(default)]
    pub magicid: i32,
    #[serde(default)]
    pub netcfg: bool,
    #[serde(default)]
    pub kepthost: bool,
    #[serde(default)]
    pub staticipv6: bool,
    #[serde(default)]
    pub netns: String,
    #[serde(default)]
    pub maxinterval: i32,
    #[serde(default)]
    pub bandlimit: i64,
    #[serde(default)]
    pub qinq: String,
    #[serde(default)]
    pub mtu: i32,
    #[serde(default)]
    pub modifiedtime: String,
    #[serde(default)]
    pub acname: String,
    #[serde(default)]
    pub servicename: String,
}

impl DialStatus {
    pub fn is_connected(&self) -> bool {
        self.status == "connected"
    }
}

// ---- Srun API ----

#[derive(Debug, Serialize)]
pub struct SrunLoginRequest {
    pub parent_interface: String,
    pub mac_address: String,
}

#[derive(Debug, Serialize)]
pub struct SrunLogoutRequest {
    pub parent_interface: String,
}

#[derive(Debug, Deserialize)]
pub struct SrunApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SrunLoginData {
    pub ip: String,
    pub username: String,
    pub mac: Option<String>,
}

// ---- Srun Random Login ----

#[derive(Debug, Serialize)]
pub struct SrunRandomLoginRequest {
    pub parent_interface: String,
    pub count: u32,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SrunRandomLoginResult {
    pub mac: String,
    #[serde(with = "srun_result_format")]
    pub result: std::result::Result<SrunLoginData, String>,
}

// srun-auto-dial 用 Result<LoginResult, String> 序列化为 {"Ok": data} 或 {"Err": msg}
mod srun_result_format {
    use super::SrunLoginData;
    use serde::{Deserialize, Deserializer};

    #[derive(Deserialize)]
    #[serde(untagged)]
    #[allow(non_snake_case)]
    enum ResultHelper {
        Ok { Ok: SrunLoginData },
        Err { Err: String },
    }

    pub fn deserialize<'de, D>(
        deserializer: D,
    ) -> std::result::Result<std::result::Result<SrunLoginData, String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        match ResultHelper::deserialize(deserializer)? {
            ResultHelper::Ok { Ok: data } => std::result::Result::Ok(std::result::Result::Ok(data)),
            ResultHelper::Err { Err: msg } => std::result::Result::Ok(std::result::Result::Err(msg)),
        }
    }
}

// ---- 网络配置上传 (plain_text.json 格式) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkLineConfig {
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub proto: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub acname: String,
    #[serde(default)]
    pub servicename: String,
    #[serde(default)]
    pub vlanid: i32,
    #[serde(default)]
    pub qinq: String,
    #[serde(default)]
    pub bandwidth: i32,
    #[serde(default)]
    pub bandlimit: i64,
    #[serde(default)]
    pub maxinterval: i32,
    #[serde(default)]
    pub dialnumber: i32,
    pub nic: String,
    pub macaddr: String,
    #[serde(default)]
    pub ipaddr: String,
    #[serde(default)]
    pub netmask: String,
    #[serde(default)]
    pub gateway: String,
    #[serde(default)]
    pub dns1: String,
    #[serde(default)]
    pub dns2: String,
    #[serde(default)]
    pub ipaddr6: String,
    #[serde(default)]
    pub gateway6: String,
    #[serde(default)]
    pub prefixlen6: i32,
    #[serde(default)]
    pub disable: bool,
    #[serde(default)]
    pub delaytime: i32,
    #[serde(default)]
    pub nodelay: bool,
    #[serde(default)]
    pub portid: i32,
    #[serde(default)]
    pub remotevtep: String,
    #[serde(default)]
    pub vtepipaddr: String,
    #[serde(default)]
    pub vtepnetmask: String,
    #[serde(default)]
    pub vni: i32,
    #[serde(default)]
    pub vport: i32,
    #[serde(default)]
    pub modifiedtime: String,
}

impl NetworkLineConfig {
    /// 从现有 DialStatus 构建，可选替换 MAC
    pub fn from_dial_status(d: &DialStatus, new_mac: Option<&str>) -> Self {
        Self {
            tag: String::new(),
            proto: d.proto.clone(),
            username: d.username.clone(),
            password: String::new(),
            acname: d.acname.clone(),
            servicename: d.servicename.clone(),
            vlanid: d.vlanid,
            qinq: d.qinq.clone(),
            bandwidth: d.bandwidth,
            bandlimit: d.bandlimit,
            maxinterval: d.maxinterval,
            dialnumber: d.dialnumber,
            nic: d.nic.clone(),
            macaddr: new_mac.unwrap_or(&d.macaddr).to_string(),
            ipaddr: String::new(),
            netmask: String::new(),
            gateway: String::new(),
            dns1: String::new(),
            dns2: String::new(),
            ipaddr6: String::new(),
            gateway6: String::new(),
            prefixlen6: 0,
            disable: d.disable,
            delaytime: 0,
            nodelay: false,
            portid: 0,
            remotevtep: String::new(),
            vtepipaddr: String::new(),
            vtepnetmask: String::new(),
            vni: 0,
            vport: 0,
            modifiedtime: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }
    }

    /// 构建默认 DHCP 线路
    pub fn new_dhcp(nic: &str, macaddr: &str) -> Self {
        Self {
            tag: String::new(),
            proto: "dhcp".to_string(),
            username: String::new(),
            password: String::new(),
            acname: String::new(),
            servicename: String::new(),
            vlanid: 0,
            qinq: String::new(),
            bandwidth: 0,
            bandlimit: 0,
            maxinterval: 0,
            dialnumber: 0,
            nic: nic.to_string(),
            macaddr: macaddr.to_string(),
            ipaddr: String::new(),
            netmask: String::new(),
            gateway: String::new(),
            dns1: String::new(),
            dns2: String::new(),
            ipaddr6: String::new(),
            gateway6: String::new(),
            prefixlen6: 0,
            disable: false,
            delaytime: 0,
            nodelay: false,
            portid: 0,
            remotevtep: String::new(),
            vtepipaddr: String::new(),
            vtepnetmask: String::new(),
            vni: 0,
            vport: 0,
            modifiedtime: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }
    }
}

// ---- 加密请求体 ----

#[derive(Debug, Serialize)]
pub struct EncryptedRequest {
    pub nonastr: String,
    pub timestamp: i64,
    pub account_info: String,
    pub key: String,
    pub sign: String,
}
