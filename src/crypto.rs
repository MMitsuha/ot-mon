use aes::cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use md5::{Digest as Md5Digest, Md5};
use rand::Rng;
use rsa::{Oaep, RsaPublicKey, pkcs8::DecodePublicKey};
use sha1::Sha1;

use crate::api::types::{EncryptedRequest, NetworkLineEntry};
use crate::error::{OtMonError, Result};

const RSA_PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCzxrU88w3L8WhJWNYlWciyr6Et
8PgdiMT5A0CJGJ73M8B1qB9TzrJIs8Q9CdgFd90enB9QBw7tZzC79XO+MLWcSECy
GUYJUd8bUaVQowBgiS6ugFa/9XlNWX8Emj681kWFRCbEiQzDmwvg33vEA4HaK1e2
LdNEOC+bK2+C9bzz8QIDAQAB
-----END PUBLIC KEY-----";

const SIGNING_KEY: &str = "GZdfQTVtx7xib71FqIyWrUhwzqZ55KJo";
const RANDOM_CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

/// OpenSSL EVP_BytesToKey (MD5, 1 iteration) — CryptoJS 默认密钥派生
fn evp_bytes_to_key(password: &[u8], salt: &[u8]) -> ([u8; 32], [u8; 16]) {
    let mut derived = Vec::with_capacity(48);
    let mut block = Vec::new();

    while derived.len() < 48 {
        let mut hasher = Md5::new();
        hasher.update(&block);
        hasher.update(password);
        hasher.update(salt);
        block = hasher.finalize().to_vec();
        derived.extend_from_slice(&block);
    }

    let mut key = [0u8; 32];
    let mut iv = [0u8; 16];
    key.copy_from_slice(&derived[..32]);
    iv.copy_from_slice(&derived[32..48]);
    (key, iv)
}

/// AES-256-CBC 加密 (CryptoJS OpenSSL 格式: Base64("Salted__" + salt + ciphertext))
fn aes_encrypt_cryptojs(plaintext: &str, passphrase: &str) -> String {
    let salt: [u8; 8] = rand::rng().random();
    let (key, iv) = evp_bytes_to_key(passphrase.as_bytes(), &salt);

    let plaintext_bytes = plaintext.as_bytes();
    // PKCS7 padding: 需要分配足够空间
    let padded_len = (plaintext_bytes.len() / 16 + 1) * 16;
    let mut buf = vec![0u8; padded_len];
    buf[..plaintext_bytes.len()].copy_from_slice(plaintext_bytes);

    let ciphertext = Aes256CbcEnc::new(&key.into(), &iv.into())
        .encrypt_padded_mut::<Pkcs7>(&mut buf, plaintext_bytes.len())
        .expect("AES 加密失败");

    // "Salted__" + salt + ciphertext
    let mut result = Vec::with_capacity(8 + 8 + ciphertext.len());
    result.extend_from_slice(b"Salted__");
    result.extend_from_slice(&salt);
    result.extend_from_slice(ciphertext);

    BASE64.encode(&result)
}

/// RSA-OAEP (SHA-1) 加密
fn rsa_encrypt(plaintext: &str) -> Result<String> {
    let public_key = RsaPublicKey::from_public_key_pem(RSA_PUBLIC_KEY_PEM)
        .map_err(|e| OtMonError::Config(format!("RSA 公钥解析失败: {e}")))?;

    // rsa crate 用 rand_core 0.6，需要用它自己的 OsRng
    let mut rng = rsa::rand_core::OsRng;
    let padding = Oaep::new::<Sha1>();
    let encrypted = public_key
        .encrypt(&mut rng, padding, plaintext.as_bytes())
        .map_err(|e| OtMonError::Config(format!("RSA 加密失败: {e}")))?;

    Ok(BASE64.encode(&encrypted))
}

/// 生成 16 字符随机口令
fn random_passphrase() -> String {
    let mut rng = rand::rng();
    (0..16)
        .map(|_| {
            let idx = rng.random_range(0..RANDOM_CHARSET.len());
            RANDOM_CHARSET[idx] as char
        })
        .collect()
}

/// MD5 签名: 参数按 key 排序 → "k1=v1&k2=v2&key=SIGNING_KEY" → MD5
fn generate_sign(params: &[(&str, &str)]) -> String {
    let mut sorted: Vec<_> = params.to_vec();
    sorted.sort_by_key(|&(k, _)| k);

    let mut parts: Vec<String> = sorted
        .iter()
        .filter(|&&(k, _)| k != "sign")
        .map(|&(k, v)| format!("{k}={v}"))
        .collect();
    parts.push(format!("key={SIGNING_KEY}"));

    let sign_str = parts.join("&");
    let digest = Md5::digest(sign_str.as_bytes());
    format!("{:x}", digest)
}

/// 加密完整的 API 请求
pub fn encrypt_request(entries: &[NetworkLineEntry]) -> Result<EncryptedRequest> {
    let passphrase = random_passphrase();

    // JSON 序列化（紧凑格式，与 Python separators=(",",":") 一致）
    let plaintext = serde_json::to_string(entries)?;

    // AES 加密
    let account_info = aes_encrypt_cryptojs(&plaintext, &passphrase);

    // RSA 加密口令
    let encrypted_key = rsa_encrypt(&passphrase)?;

    // nonce + timestamp
    let nonastr = uuid::Uuid::new_v4().to_string();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // MD5 签名
    let ts_str = timestamp.to_string();
    let sign = generate_sign(&[
        ("nonastr", &nonastr),
        ("timestamp", &ts_str),
        ("account_info", &account_info),
        ("key", &encrypted_key),
    ]);

    Ok(EncryptedRequest {
        nonastr,
        timestamp,
        account_info,
        key: encrypted_key,
        sign,
    })
}
