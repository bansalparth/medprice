import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

const SID_COOKIE = "mp_sid";
const SID_TTL_SECONDS = 365 * 24 * 60 * 60;

export function readSid(req: NextRequest): string | null {
  return req.cookies.get(SID_COOKIE)?.value ?? null;
}

export function ensureSid(req: NextRequest, res: NextResponse): string {
  const existing = readSid(req);
  if (existing) return existing;
  const sid = randomBytes(16).toString("hex");
  res.cookies.set(SID_COOKIE, sid, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SID_TTL_SECONDS,
    path: "/",
  });
  return sid;
}

export function classifyDevice(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

export function classifyReferrer(referrer: string | null | undefined): string {
  if (!referrer) return "direct";
  try {
    const u = new URL(referrer);
    const host = u.hostname.toLowerCase();
    if (/google|bing|duckduckgo|yahoo|yandex|baidu/.test(host)) return "search";
    if (/facebook|instagram|twitter|x\.com|t\.co|linkedin|reddit|whatsapp|telegram|youtube/.test(host)) return "social";
    return "other";
  } catch {
    return "other";
  }
}
