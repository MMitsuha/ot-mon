FROM rust:1.89-bookworm AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release \
    && rm -rf src target/release/ot-mon target/release/ot-mon.d target/release/deps/ot_mon*

COPY src/ src/
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/ot-mon /usr/local/bin/ot-mon
COPY config.example.toml /etc/ot-mon/config.example.toml

ENTRYPOINT ["ot-mon"]
CMD ["/etc/ot-mon/config.toml"]
