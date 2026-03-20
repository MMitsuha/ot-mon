# Repository Guidelines

## Project Structure & Module Organization
`src/main.rs` wires the daemon together and starts the three long-running tasks: the poller, daily scheduler, and Telegram bot. Keep new code in the existing modules by responsibility: `src/api/` for HTTP clients and request/response types, `src/monitor/` for polling and relogin workflows, `src/db/` for MongoDB access and `*Doc` models, and `src/notify/` for Telegram delivery and message formatting. Shared infrastructure lives in `src/config.rs`, `src/crypto.rs`, and `src/error.rs`. CI is defined in `.github/workflows/ci.yml`. Use `config.example.toml` as the template; the real `config.toml` is gitignored.

## Build, Test, and Development Commands
Use a current Rust toolchain that supports edition 2024; CI runs on nightly.

- `cargo check` validates the crate quickly without producing a release binary.
- `cargo fmt --check` verifies formatting; run `cargo fmt` before committing if it fails.
- `cargo clippy -- -D warnings` matches the CI lint gate and treats warnings as errors.
- `cargo build --release` produces the production binary.
- `cargo run -- config.toml` starts the daemon with an explicit config file.
- `docker build -t ot-mon .` builds the container image used by deployment.

## Coding Style & Naming Conventions
Follow rustfmt defaults and keep code idiomatic Rust: `snake_case` for modules, files, and functions; `PascalCase` for structs and enums. Mirror existing names such as `DeviceClient`, `SrunClient`, and `ReloginEventDoc`. Prefer small async functions, explicit error propagation with `?`, and structured `tracing` fields instead of ad hoc string logs.

## Testing Guidelines
There is no dedicated `tests/` tree yet. Add focused `#[cfg(test)]` unit tests beside the module you change, or create integration tests under `tests/` when behavior crosses module boundaries. Before opening a PR, run `cargo check`, `cargo fmt --check`, and `cargo clippy -- -D warnings`. For changes that touch polling, relogin, or notifications, also do a manual smoke test against non-production device, MongoDB, and Telegram endpoints.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, and `style:`. Keep subjects imperative and specific, for example `fix: handle partial relogin failures in scheduler`. PRs should describe behavior changes, config or schema impacts, and manual verification steps. Include logs or Telegram message samples when changing notification formatting or relogin flows, and link the related issue when one exists.

## Security & Configuration Tips
Do not commit real `config.toml`, bot tokens, MongoDB URIs, or device-specific secrets. When configuration changes, update both `config.example.toml` and `README.md` in the same PR.
