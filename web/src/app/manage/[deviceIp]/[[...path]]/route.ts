import { type NextRequest, NextResponse } from "next/server";
import {
  DeviceAccessError,
  getDeviceProxyContext,
} from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    deviceIp: string;
    path?: string[];
  }>;
};

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "pragma",
  "user-agent",
  "x-requested-with",
] as const;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "set-cookie",
]);

function buildManageBasePath(deviceIp: string): string {
  return `/manage/${encodeURIComponent(deviceIp)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteLocationHeader(
  location: string,
  deviceOrigin: string,
  manageBasePath: string,
): string {
  try {
    const target = new URL(location, `${deviceOrigin}/`);
    if (target.origin !== deviceOrigin) {
      return location;
    }

    return `${manageBasePath}${target.pathname}${target.search}${target.hash}`;
  } catch {
    return location;
  }
}

function rewriteTextResponse(
  body: string,
  contentType: string,
  deviceOrigin: string,
  manageBasePath: string,
): string {
  const proxiedRoot = `${manageBasePath}/`;
  let rewritten = body.replace(
    new RegExp(escapeRegExp(deviceOrigin), "g"),
    manageBasePath,
  );

  if (contentType.includes("text/html")) {
    rewritten = rewritten.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${manageBasePath}/">`,
    );
    rewritten = rewritten.replace(
      /((?:href|src|action)=["'])\/(?!\/|manage\/)/gi,
      `$1${manageBasePath}/`,
    );
  }

  if (
    contentType.includes("text/html") ||
    contentType.includes("javascript")
  ) {
    rewritten = rewritten.replace(
      /((?:window\.)?routerBase\s*=\s*["'])\/(["'])/gi,
      `$1${proxiedRoot}$2`,
    );
    rewritten = rewritten.replace(
      /((?:window\.)?(?:publicPath|basename)\s*[:=]\s*["'])\/(["'])/gi,
      `$1${proxiedRoot}$2`,
    );
    rewritten = rewritten.replace(
      /([A-Za-z_$][\w$]*\.p\s*=\s*["'])\/(["'])/g,
      `$1${proxiedRoot}$2`,
    );
    rewritten = rewritten.replace(
      /(["'])\/(?!manage\/)(v1\.0|cgi-bin|static|assets|js|css|img|images|login|logout)/gi,
      `$1${manageBasePath}/$2`,
    );
  }

  if (contentType.includes("text/html") || contentType.includes("text/css")) {
    rewritten = rewritten.replace(
      /url\((["']?)\/(?!\/|manage\/)/gi,
      `url($1${manageBasePath}/`,
    );
  }

  return rewritten;
}

function buildUpstreamHeaders(
  request: NextRequest,
  deviceOrigin: string,
  siteCookie: string,
): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  headers.set("cookie", `site_cookie=${siteCookie}`);
  headers.set("origin", deviceOrigin);
  headers.set("referer", `${deviceOrigin}/`);

  return headers;
}

function buildResponseHeaders(
  upstreamResponse: Response,
  deviceOrigin: string,
  manageBasePath: string,
): Headers {
  const headers = new Headers();

  for (const [name, value] of upstreamResponse.headers.entries()) {
    const lowerName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerName)) {
      continue;
    }

    if (lowerName === "location") {
      headers.set(
        name,
        rewriteLocationHeader(value, deviceOrigin, manageBasePath),
      );
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

async function proxyToDevice(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { deviceIp, path = [] } = await context.params;
  const manageBasePath = buildManageBasePath(deviceIp);

  let proxyContext: Awaited<ReturnType<typeof getDeviceProxyContext>>;
  try {
    proxyContext = await getDeviceProxyContext(deviceIp);
  } catch (error) {
    const status =
      error instanceof DeviceAccessError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "设备反代初始化失败";
    return new NextResponse(message, {
      status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const upstreamUrl = new URL(
    `${proxyContext.deviceOrigin}/${path.join("/")}`,
  );
  upstreamUrl.search = request.nextUrl.search;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(
        request,
        proxyContext.deviceOrigin,
        proxyContext.siteCookie,
      ),
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    return new NextResponse(
      `访问设备 ${proxyContext.deviceIp} 失败: ${String(error)}`,
      {
        status: 502,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      },
    );
  }

  const responseHeaders = buildResponseHeaders(
    upstreamResponse,
    proxyContext.deviceOrigin,
    manageBasePath,
  );
  const contentType = upstreamResponse.headers.get("content-type") ?? "";

  let body: BodyInit | null = null;
  if (
    request.method !== "HEAD" &&
    upstreamResponse.status !== 204 &&
    upstreamResponse.status !== 304
  ) {
    if (
      contentType.includes("text/html") ||
      contentType.includes("text/css") ||
      contentType.includes("javascript")
    ) {
      body = rewriteTextResponse(
        await upstreamResponse.text(),
        contentType,
        proxyContext.deviceOrigin,
        manageBasePath,
      );
      responseHeaders.delete("content-length");
      responseHeaders.delete("content-encoding");
    } else {
      body = upstreamResponse.body;
    }
  }

  const response = new NextResponse(body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });

  response.cookies.set({
    name: "site_cookie",
    value: proxyContext.siteCookie,
    path: manageBasePath,
    sameSite: "lax",
  });

  return response;
}

export const GET = proxyToDevice;
export const POST = proxyToDevice;
export const PUT = proxyToDevice;
export const PATCH = proxyToDevice;
export const DELETE = proxyToDevice;
export const HEAD = proxyToDevice;
export const OPTIONS = proxyToDevice;
