FROM rust:slim AS builder

RUN apt-get update && apt-get install -y musl-tools && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-unknown-linux-musl

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
# 缓存依赖层
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release --target x86_64-unknown-linux-musl \
    && rm -rf src

COPY src/ src/
RUN touch src/main.rs && cargo build --release --target x86_64-unknown-linux-musl

FROM alpine:3
RUN apk add --no-cache ca-certificates
COPY --from=builder /build/target/x86_64-unknown-linux-musl/release/ot-mon /usr/local/bin/ot-mon
COPY config.example.toml /etc/ot-mon/config.example.toml

ENTRYPOINT ["ot-mon"]
CMD ["/etc/ot-mon/config.toml"]
