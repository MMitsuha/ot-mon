FROM rust:slim AS builder

RUN apt-get update && apt-get install -y musl-tools pkg-config libssl-dev perl make && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-unknown-linux-musl

# 交叉编译 OpenSSL for musl
ENV OPENSSL_VERSION=3.4.1
RUN curl -fsSL https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz | tar xz \
    && cd openssl-${OPENSSL_VERSION} \
    && CC=musl-gcc ./Configure no-shared no-async linux-x86_64 --prefix=/usr/local/musl --openssldir=/usr/local/musl/ssl \
    && make -j$(nproc) \
    && make install_sw \
    && cd .. && rm -rf openssl-${OPENSSL_VERSION}

ENV OPENSSL_DIR=/usr/local/musl
ENV OPENSSL_STATIC=1
ENV PKG_CONFIG_ALLOW_CROSS=1

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
