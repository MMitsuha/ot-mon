import "server-only";

import { createHash, createHmac } from "node:crypto";
import { getDb } from "@/lib/mongodb";

const DEVICE_PORT = 8080;
const JWT_KEY = "guyf131gIS2g1";
const DEVICE_HOST_PATTERN = /^[A-Za-z0-9.-]+$/;

interface LoginInfoResponse {
  result?: {
    sn?: string | null;
  } | null;
}

export class DeviceAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DeviceAccessError";
  }
}

function getDeviceOrigin(deviceIp: string): string {
  return `http://${deviceIp}:${DEVICE_PORT}`;
}

export function generateSiteCookie(sn: string): string {
  const normalizedSn = sn.trim();
  if (!normalizedSn) {
    throw new DeviceAccessError("设备 SN 为空，无法生成 site_cookie", 502);
  }

  const esn = createHash("md5").update(normalizedSn).digest("hex").slice(0, 8);
  const header = Buffer.from(
    JSON.stringify({
      alg: "HS256",
      typ: "JWT",
    }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      esn,
      exp: Math.floor(Date.now() / 1000) + 259200,
      iss: "activation",
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", JWT_KEY)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

export async function getDeviceProxyContext(deviceIp: string): Promise<{
  deviceIp: string;
  deviceOrigin: string;
  siteCookie: string;
}> {
  const normalizedDeviceIp = deviceIp.trim();
  if (!DEVICE_HOST_PATTERN.test(normalizedDeviceIp)) {
    throw new DeviceAccessError("设备标识不合法", 404);
  }

  const db = await getDb();
  const device = await db.collection("pppoe_status").findOne(
    { device_ip: normalizedDeviceIp },
    { projection: { _id: 1 } },
  );
  if (!device) {
    throw new DeviceAccessError(`未找到设备 ${normalizedDeviceIp}`, 404);
  }

  const deviceOrigin = getDeviceOrigin(normalizedDeviceIp);

  let response: Response;
  try {
    response = await fetch(`${deviceOrigin}/v1.0/login_info`, {
      cache: "no-store",
    });
  } catch (error) {
    throw new DeviceAccessError(
      `获取设备 ${normalizedDeviceIp} 登录信息失败: ${String(error)}`,
      502,
    );
  }

  if (!response.ok) {
    throw new DeviceAccessError(
      `设备 ${normalizedDeviceIp} login_info 返回 ${response.status} ${response.statusText}`,
      502,
    );
  }

  let payload: LoginInfoResponse;
  try {
    payload = (await response.json()) as LoginInfoResponse;
  } catch (error) {
    throw new DeviceAccessError(
      `解析设备 ${normalizedDeviceIp} login_info 失败: ${String(error)}`,
      502,
    );
  }

  const sn = payload.result?.sn?.trim();
  if (!sn) {
    throw new DeviceAccessError(
      `设备 ${normalizedDeviceIp} login_info 未返回有效 SN`,
      502,
    );
  }

  return {
    deviceIp: normalizedDeviceIp,
    deviceOrigin,
    siteCookie: generateSiteCookie(sn),
  };
}
