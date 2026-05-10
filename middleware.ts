import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key);
  }
}, 60_000);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api")) return NextResponse.next();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
  } else {
    entry.count++;
    if (entry.count > MAX_REQUESTS) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host") || "";

  if (origin || referer) {
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    if (!isLocal) {
      const allowedHttps = `https://${host}`;
      const allowedHttp = `http://${host}`;
      const originOk = !origin || origin === allowedHttps || origin === allowedHttp;
      const refererOk =
        !referer || referer.startsWith(allowedHttps) || referer.startsWith(allowedHttp);
      if (!originOk && !refererOk) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const clientHeader = request.headers.get("x-medprice-client");
  if (!clientHeader) {
    return NextResponse.json({ error: "Missing client identifier" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
