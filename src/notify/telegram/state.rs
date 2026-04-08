use crate::api::device::DeviceClient;
use crate::api::srun::SrunClient;
use crate::config::Config;
use crate::db::mongo::MongoStore;
use std::sync::Arc;

/// Shared runtime context held by every command handler.
pub struct BotState {
    pub config: Arc<Config>,
    pub device_client: Arc<DeviceClient>,
    pub srun: Arc<SrunClient>,
    pub mongo: Arc<MongoStore>,
}
