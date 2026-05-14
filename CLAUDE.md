# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# Daemon (Rust)
cargo build              # debug build
cargo build --release    # release build
cargo run                # run with default config.toml
cargo run -- path/to/config.toml  # run with custom config path
cargo check              # type-check without building
cargo clippy             # lint
cargo fmt                # format

# Web dashboard (Bun + Next.js)
cd web && bun install    # install dependencies
bun run dev              # dev server at http://localhost:3000
bun run build            # production build
bun run lint             # ESLint
bunx tsc --noEmit        # type check
```

No tests exist yet. The project requires a running MongoDB instance and network access to device APIs and srun-auto-dial to function.

## Architecture

ot-mon is a PPPoE multi-dial monitoring daemon. It watches network devices for disconnected lines, automatically re-dials them via srun-auto-dial, and sends notifications via Telegram. Three concurrent tokio tasks run in `main.rs`:

1. **Poller** (`monitor/poller.rs`) — polls each device's PPPoE status and hardware status (CPU/memory/disk) at a configurable interval, saves to MongoDB, tracks consecutive disconnects per line, and triggers `relogin_disconnected` only when the `disconnect_threshold` is reached.
2. **Daily Scheduler** (`monitor/scheduler.rs`) — uses `tokio-cron-scheduler` to run `relogin_all` (full MAC replacement) at a configured time (e.g., 04:00). Skips devices with `dry = true`.
3. **Telegram Bot** (`notify/telegram.rs`) — receives `NotifyMessage` events via an `mpsc` channel and forwards formatted HTML messages to a Telegram chat. Handles `/status`, `/relogin <device>`, `/reloginall` commands.

### Relogin Flow (`monitor/relogin.rs`)

Two modes: `relogin_disconnected` (replace only offline MACs) and `relogin_all` (replace every line). Both follow the same pattern:
- Call `SrunClient::login_random_until_success` to get new MAC addresses via srun-auto-dial
- Build `NetworkLineConfig` array (either patching disconnected lines or creating fresh DHCP entries)
- Encrypt with `crypto::encrypt_request` and upload to the device via `DeviceClient::set_network_config`
- Log `ReloginEventDoc` to MongoDB

### Crypto (`crypto.rs`)

Implements the device API's encryption protocol:
- AES-256-CBC with CryptoJS-compatible OpenSSL format (`Salted__` + salt + ciphertext, key derived via `EVP_BytesToKey` with MD5)
- RSA-OAEP (SHA-1) to encrypt the random AES passphrase
- MD5 signature over sorted parameters with a static signing key
- Hardcoded RSA public key and signing key are specific to the target device firmware

### Device Authentication (`api/device.rs`)

Hardware status endpoint requires JWT authentication:
- Fetch device SN via `/v1.0/login_info`
- Generate `site_cookie` JWT (HS256) with `esn = MD5(SN)[:8]`
- Pass as Cookie header to `/v1.0/devices/status`

### Key Data Flow

```
DeviceClient (HTTP :8080) ←→ devices (PPPoE status / hardware status / config upload)
SrunClient   (HTTP)       ←→ srun-auto-dial (MAC login/logout)
MongoStore                ←→ MongoDB (pppoe_status + hardware_status + relogin_events, 30-day TTL)
NotifyMessage mpsc channel → Telegram bot → user
Web dashboard (Next.js)   ←→ MongoDB (read-only, speed + hardware charts)
```

### Module Layout

- `api/` — HTTP clients: `DeviceClient` (device status/config/hardware), `SrunClient` (srun login/logout), `types.rs` (all request/response structs including hardware types)
- `config.rs` — TOML config deserialization with defaults (`disconnect_threshold`, `dry` mode)
- `crypto.rs` — AES/RSA encryption for device config upload
- `db/` — MongoDB storage: `models.rs` (document schemas: `PppoeStatusDoc`, `HardwareStatusDoc`, `ReloginEventDoc`), `mongo.rs` (connection/queries/indexes)
- `monitor/` — core logic: `poller.rs` (with disconnect counter tracking), `scheduler.rs`, `relogin.rs`
- `notify/` — `telegram.rs` (bot + notification dispatch), `messages.rs` (HTML message formatting)
- `error.rs` — `OtMonError` enum with `thiserror`, project-wide `Result` alias

### Web Dashboard (`web/`)

Bun + Next.js 16 + TypeScript + Tailwind CSS + recharts. Dark theme (nextjs.org style).

- `src/app/api/speed/route.ts` — MongoDB aggregation for time-bucketed speed data
- `src/app/api/hardware/route.ts` — MongoDB aggregation for CPU/memory/disk usage
- `src/app/api/devices/route.ts` — Distinct device list
- `src/components/SpeedChart.tsx` — Upload/download area chart with gap detection, average reference lines
- `src/components/UsageChart.tsx` — Reusable percentage chart for CPU/memory/disk with gap detection
- `src/components/Dashboard.tsx` — Main dashboard: device selector, time range, stat cards, all charts
- `src/lib/mongodb.ts` — MongoDB client singleton (HMR-safe)

## Configuration

Copy `config.example.toml` to `config.toml`. Sections: `[monitor]`, `[srun]`, `[mongodb]`, `[telegram]`, `[[devices]]`. The `config.toml` is gitignored.

Key options:
- `monitor.disconnect_threshold` — consecutive disconnect polls before triggering relogin (default: 1)
- `devices[].dry` — if `true`, device is monitor-only (no relogin operations)
- `devices[].userinfo_path` — optional JSON path that srun-auto-dial should read credentials from for this device (sent as `userinfo_path` on `/api/login/random`). Per-line files (telecom / unicom) must not be mixed; omit to fall back to srun-auto-dial's default.

## Rust Edition

Uses Rust edition **2024** — requires nightly or recent stable toolchain.
