"use client";

const SID_COOKIE = "mp_sid";

function uuid(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) {
    return c.randomUUID().replace(/-/g, "");
  }
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function writeCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

export function getSid(): string {
  if (typeof document === "undefined") return "";
  let sid = readCookie(SID_COOKIE);
  if (!sid) {
    sid = uuid();
    writeCookie(SID_COOKIE, sid, 365);
  }
  return sid;
}

function readLocation(): {
  pincode?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
} {
  try {
    const raw = localStorage.getItem("medprice_location_v1");
    if (!raw) return {};
    const p = JSON.parse(raw);
    return {
      pincode: p.pincode ?? undefined,
      city: p.city ?? undefined,
      state: p.state ?? undefined,
      lat: typeof p.lat === "number" ? p.lat : undefined,
      lng: typeof p.lng === "number" ? p.lng : undefined,
    };
  } catch {
    return {};
  }
}

export function trackPageview(path: string) {
  if (typeof window === "undefined") return;
  const sid = getSid();
  const body = JSON.stringify({
    sid,
    path,
    referrer: document.referrer || null,
    userAgent: navigator.userAgent,
    location: readLocation(),
  });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/track/pageview", blob);
      return;
    }
  } catch {}
  fetch("/api/track/pageview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function trackLocatorAction(action: string, meta?: Record<string, any>) {
  if (typeof window === "undefined") return;
  const sid = getSid();
  const body = JSON.stringify({ sid, action, meta: meta ?? null });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/track/locator", blob);
      return;
    }
  } catch {}
  fetch("/api/track/locator", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
