import { type NextRequest, NextResponse } from "next/server";

const MANAGE_REFERRER_PATTERN = /^\/manage\/([^/]+)(?:\/|$)/;

function extractManagedDevice(pathname: string): string | null {
  const match = pathname.match(MANAGE_REFERRER_PATTERN);
  return match?.[1] ?? null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/manage/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return NextResponse.next();
  }

  let refererUrl: URL;
  try {
    refererUrl = new URL(referer);
  } catch {
    return NextResponse.next();
  }

  if (refererUrl.origin !== request.nextUrl.origin) {
    return NextResponse.next();
  }

  const deviceIp = extractManagedDevice(refererUrl.pathname);
  if (!deviceIp) {
    return NextResponse.next();
  }

  const rewrittenUrl = request.nextUrl.clone();
  rewrittenUrl.pathname = `/manage/${deviceIp}${pathname}`;

  return NextResponse.rewrite(rewrittenUrl);
}
