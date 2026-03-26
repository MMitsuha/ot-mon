# ot-mon

PPPoE 多拨监控守护进程。自动检测设备断线、通过 [srun-auto-dial](https://github.com/MMitsuha/srun-auto-dial) 重新拨号，并通过 Telegram 发送通知。附带 Web 仪表盘可视化速度及硬件状态。

## 功能

- **状态轮询** — 定时轮询设备 PPPoE 多拨状态及硬件状态（CPU/内存/磁盘），检测断线自动重拨
- **断线阈值** — 连续检测到断线超过配置阈值后才触发重拨，防止网络波动误操作
- **每日定时全量重拨** — 在指定时间替换所有线路 MAC 地址
- **Telegram Bot** — 断线/重拨通知推送，支持 `/status`、`/relogin`、`/reloginall` 命令
- **MongoDB 持久化** — 记录状态历史、硬件状态和重拨事件（30 天 TTL 自动清理）
- **Dry 模式** — 可按设备配置为仅监控，不执行重拨操作
- **Web 仪表盘** — 实时可视化：
  - 上传/下载速度折线图（含平均值参考线、数据缺失区域标记）
  - CPU 使用率折线图
  - 内存实际用量折线图
  - 磁盘使用率折线图
  - 性能参数统计卡片（当前值 + 平均值）
  - 多设备切换、时间范围选择、图表全屏、60 秒自动刷新

## 依赖

- [srun-auto-dial](https://github.com/MMitsuha/srun-auto-dial) — MAC 登录/登出服务
- MongoDB — 状态与事件存储
- Telegram Bot Token — 通知推送

## 快速开始

### 从源码构建

```bash
# 守护进程（需要 Rust 1.85+ 或 nightly）
cargo build --release

# Web 仪表盘（需要 Bun）
cd web && bun install && bun run build
```

### Docker

```bash
# 守护进程
docker pull ghcr.io/mmitsuha/ot-mon:latest
docker run -v /path/to/config.toml:/etc/ot-mon/config.toml ghcr.io/mmitsuha/ot-mon:latest

# Web 仪表盘
docker pull ghcr.io/mmitsuha/ot-mon-web:latest
docker run -p 3000:3000 -e MONGODB_URI=mongodb://mongo:27017 ghcr.io/mmitsuha/ot-mon-web:latest
```

### Docker Compose

```yaml
services:
  ot-mon:
    image: ghcr.io/mmitsuha/ot-mon:latest
    restart: unless-stopped
    volumes:
      - ./config.toml:/etc/ot-mon/config.toml:ro
    depends_on:
      - mongo

  web:
    image: ghcr.io/mmitsuha/ot-mon-web:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017
      - MONGODB_DATABASE=ot_mon
    depends_on:
      - mongo

  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

## 配置

### 守护进程

复制 `config.example.toml` 为 `config.toml` 并修改：

```toml
[monitor]
poll_interval_secs = 60         # 轮询间隔（秒）
daily_relogin_time = "04:00"    # 每日重拨时间 (HH:MM)
log_level = "info"
disconnect_threshold = 3        # 连续检测到断线多少次后才触发重拨（防止网络波动）

[srun]
url = "http://192.168.1.100:3000"   # srun-auto-dial 地址
parent_interface = "eth0"            # PPPoE 父接口名

[mongodb]
uri = "mongodb://localhost:27017"
database = "ot_mon"

[telegram]
bot_token = "YOUR_BOT_TOKEN"
chat_id = "YOUR_CHAT_ID"

[[devices]]
name = "设备1"
ip = "192.168.1.101"
dry = true                      # 仅监控，不执行重拨

[[devices]]
name = "设备2"
ip = "192.168.1.102"
```

运行时可指定配置文件路径：

```bash
ot-mon /path/to/config.toml    # 默认读取当前目录下的 config.toml
```

### Web 仪表盘

通过环境变量配置（参考 `web/.env.local.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB 连接字符串 |
| `MONGODB_DATABASE` | `ot_mon` | 数据库名 |

本地开发：

```bash
cd web
cp .env.local.example .env.local  # 编辑 MongoDB 连接信息
bun install
bun run dev                       # http://localhost:3000
```

## Telegram 命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/status` | 查看所有设备当前 PPPoE 状态 |
| `/relogin <设备名>` | 手动重拨指定设备的断线线路 |
| `/reloginall` | 手动触发所有设备全量重拨 |

## License

MIT
