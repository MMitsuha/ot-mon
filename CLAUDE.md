# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
cargo build              # debug build
cargo build --release    # release build
cargo run                # run with default config.toml
cargo run -- path/to/config.toml  # run with custom config path
cargo check              # type-check without building
cargo clippy             # lint
cargo fmt                # format
```

No tests exist yet. The project requires a running MongoDB instance and network access to device APIs and srun-auto-dial to function.

## Architecture

ot-mon is a PPPoE multi-dial monitoring daemon. It watches network devices for disconnected lines, automatically re-dials them via [srun-auto-dial](http://), and sends notifications via Telegram. Three concurrent tokio tasks run in `main.rs`:

1. **Poller** (`monitor/poller.rs`) — polls each device's PPPoE status at a configurable interval, saves to MongoDB, detects disconnections, and triggers `relogin_disconnected` for affected lines only.
2. **Daily Scheduler** (`monitor/scheduler.rs`) — uses `tokio-cron-scheduler` to run `relogin_all` (full MAC replacement) at a configured time (e.g., 04:00).
3. **Telegram Bot** (`notify/telegram.rs`) — receives `NotifyMessage` events via an `mpsc` channel and forwards formatted HTML messages to a Telegram chat. Also handles `/status`, `/relogin <device>`, `/reloginall` commands.

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

### Key Data Flow

```
DeviceClient (HTTP :8080) ←→ devices (PPPoE status / config upload)
SrunClient   (HTTP)       ←→ srun-auto-dial (MAC login/logout)
MongoStore                ←→ MongoDB (status history + relogin events, 30-day TTL)
NotifyMessage mpsc channel → Telegram bot → user
```

### Module Layout

- `api/` — HTTP clients: `DeviceClient` (device status/config), `SrunClient` (srun login/logout), `types.rs` (all request/response structs)
- `config.rs` — TOML config deserialization with defaults
- `crypto.rs` — AES/RSA encryption for device config upload
- `db/` — MongoDB storage: `models.rs` (document schemas), `mongo.rs` (connection/queries/indexes)
- `monitor/` — core logic: `poller.rs`, `scheduler.rs`, `relogin.rs`
- `notify/` — `telegram.rs` (bot + notification dispatch), `messages.rs` (HTML message formatting)
- `error.rs` — `OtMonError` enum with `thiserror`, project-wide `Result` alias

## Configuration

Copy `config.example.toml` to `config.toml`. Sections: `[monitor]`, `[srun]`, `[mongodb]`, `[telegram]`, `[[devices]]`. The `config.toml` is gitignored.

## Rust Edition

Uses Rust edition **2024** — requires nightly or recent stable toolchain.
