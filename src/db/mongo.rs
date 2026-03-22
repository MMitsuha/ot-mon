use crate::config::MongoConfig;
use crate::db::models::*;
use crate::error::Result;
use mongodb::bson::doc;
use mongodb::options::IndexOptions;
use mongodb::{Client, Collection, Database, IndexModel};

pub struct MongoStore {
    db: Database,
}

impl MongoStore {
    pub async fn connect(config: &MongoConfig) -> Result<Self> {
        let client = Client::with_uri_str(&config.uri).await?;
        let db = client.database(&config.database);
        tracing::info!(database = %config.database, "MongoDB 连接成功");
        Ok(Self { db })
    }

    fn status_collection(&self) -> Collection<PppoeStatusDoc> {
        self.db.collection("pppoe_status")
    }

    fn relogin_collection(&self) -> Collection<ReloginEventDoc> {
        self.db.collection("relogin_events")
    }

    fn hw_status_collection(&self) -> Collection<HardwareStatusDoc> {
        self.db.collection("hardware_status")
    }

    pub async fn ensure_indexes(&self) -> Result<()> {
        // pppoe_status: 按设备+时间倒序
        self.status_collection()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "device_ip": 1, "timestamp": -1 })
                    .build(),
            )
            .await?;

        // relogin_events: 按设备+时间倒序
        self.relogin_collection()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "device_ip": 1, "timestamp": -1 })
                    .build(),
            )
            .await?;

        // pppoe_status: 30天 TTL
        self.status_collection()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "timestamp": 1 })
                    .options(
                        IndexOptions::builder()
                            .expire_after(std::time::Duration::from_secs(30 * 24 * 3600))
                            .build(),
                    )
                    .build(),
            )
            .await?;

        // hardware_status: 按设备+时间倒序
        self.hw_status_collection()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "device_ip": 1, "timestamp": -1 })
                    .build(),
            )
            .await?;

        // hardware_status: 30天 TTL
        self.hw_status_collection()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "timestamp": 1 })
                    .options(
                        IndexOptions::builder()
                            .expire_after(std::time::Duration::from_secs(30 * 24 * 3600))
                            .build(),
                    )
                    .build(),
            )
            .await?;

        tracing::info!("MongoDB 索引创建完成");
        Ok(())
    }

    pub async fn insert_status(&self, doc: PppoeStatusDoc) -> Result<()> {
        self.status_collection().insert_one(doc).await?;
        Ok(())
    }

    pub async fn insert_relogin_event(&self, doc: ReloginEventDoc) -> Result<()> {
        self.relogin_collection().insert_one(doc).await?;
        Ok(())
    }

    pub async fn insert_hw_status(&self, doc: HardwareStatusDoc) -> Result<()> {
        self.hw_status_collection().insert_one(doc).await?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn get_latest_status(&self, device_ip: &str) -> Result<Option<PppoeStatusDoc>> {
        let doc = self
            .status_collection()
            .find_one(doc! { "device_ip": device_ip })
            .sort(doc! { "timestamp": -1 })
            .await?;
        Ok(doc)
    }
}
