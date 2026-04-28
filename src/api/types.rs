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
#[allow(dead_code)]
pub struct SrunLoginRequest {
    pub parent_interface: String,
    pub mac_address: String,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
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
            ResultHelper::Err { Err: msg } => {
                std::result::Result::Ok(std::result::Result::Err(msg))
            }
        }
    }
}

// ---- 网络配置上传 ----
//
// 设备 set_dhcp_conf 接口对每条线路接受两种条目格式:
//   * 精简 (Minimal): 仅 {vlanid, nic, macaddr, qinq} —— 用于"上传全新配置"或
//     "修改某条线路 MAC"。被这种条目覆盖的线路会按设备默认值重建。
//   * 完整 (Full):    含 32 个字段 —— 用于保留某条线路当前的全部配置。
//
// 三种业务场景:
//   * 全量重拨 (relogin_all)            -> 全部条目用 Minimal (= text.json)
//   * 断线重拨 (relogin_disconnected)   -> 修改的线路用 Minimal,其余 Full (= text2.json)
//   * 无修改保存                         -> 全部条目用 Full (= text1.json,本程序不主动产生)

/// 精简条目: 仅 vlanid / nic / macaddr / qinq, 字段顺序需与设备协议一致
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkLineMinimal {
    pub vlanid: i32,
    pub nic: String,
    pub macaddr: String,
    pub qinq: String,
}

impl NetworkLineMinimal {
    pub fn new(nic: &str, macaddr: &str) -> Self {
        Self {
            vlanid: 0,
            nic: nic.to_string(),
            macaddr: macaddr.to_string(),
            qinq: String::new(),
        }
    }
}

/// 一条线路条目: 精简或完整
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum NetworkLineEntry {
    Minimal(NetworkLineMinimal),
    Full(Box<NetworkLineConfig>),
}

impl From<NetworkLineMinimal> for NetworkLineEntry {
    fn from(v: NetworkLineMinimal) -> Self {
        NetworkLineEntry::Minimal(v)
    }
}

impl From<NetworkLineConfig> for NetworkLineEntry {
    fn from(v: NetworkLineConfig) -> Self {
        NetworkLineEntry::Full(Box::new(v))
    }
}

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
    /// 从现有 DialStatus 构建保持原貌的完整条目 (用于 relogin_disconnected 中未变动的线路)
    pub fn from_dial_status(d: &DialStatus) -> Self {
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
            maxinterval: 0,
            dialnumber: d.dialnumber,
            nic: d.nic.clone(),
            macaddr: d.macaddr.clone(),
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
            modifiedtime: d.modifiedtime.clone(),
        }
    }
}

// ---- 设备登录信息响应 (/v1.0/login_info) ----

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct LoginInfoResponse {
    #[serde(default)]
    pub code: i32,
    #[serde(default)]
    pub message: String,
    pub result: Option<LoginInfoResult>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct LoginInfoResult {
    #[serde(default)]
    pub sn: String,
    #[serde(default)]
    pub active_code: String,
}

// ---- 设备硬件状态响应 (/v1.0/devices/status) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareStatusResponse {
    #[serde(default)]
    pub nowtime: i64,
    #[serde(default)]
    pub cpu: Vec<CpuInfo>,
    #[serde(default)]
    pub mem: Vec<MemInfo>,
    #[serde(default)]
    pub disk: Option<DiskData>,
    #[serde(default)]
    pub io: Vec<serde_json::Value>,
    #[serde(default)]
    pub network: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    #[serde(default)]
    pub modelname: String,
    #[serde(default)]
    pub mhz: String,
    #[serde(default)]
    pub cores: i32,
    #[serde(default)]
    pub load1: String,
    #[serde(default)]
    pub load5: String,
    #[serde(default)]
    pub load15: String,
    #[serde(default)]
    pub usage: String,
    #[serde(default)]
    pub iowait: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemInfo {
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub free: u64,
    #[serde(default)]
    pub available: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskData {
    #[serde(default)]
    pub disk_info: Vec<DiskInfo>,
    #[serde(default)]
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    #[serde(default)]
    pub name: String,
    #[serde(rename = "type", default)]
    pub disk_type: String,
    #[serde(default)]
    pub raw_type: String,
    #[serde(default)]
    pub rand_read_iops: u64,
    #[serde(default)]
    pub rand_write_iops: u64,
    #[serde(default)]
    pub system_disk: bool,
    #[serde(default)]
    pub disk_status: i32,
    #[serde(default)]
    pub rand_read_bw: u64,
    #[serde(default)]
    pub rand_write_bw: u64,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub used: u64,
    #[serde(default)]
    pub sn: String,
    #[serde(default)]
    pub err_msg: String,
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
