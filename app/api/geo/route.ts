import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * IP-based geolocation fallback for the location-context flow.
 *
 * Vercel injects city / region / country / lat / lng directly as request
 * headers (free; no extra service call). We surface those so the client can
 * fall back when the browser's `navigator.geolocation.getCurrentPosition`
 * returns POSITION_UNAVAILABLE — common on Safari + macOS, on corporate
 * VPNs, or any device that can't get a quick GPS/WiFi fix.
 *
 * The returned lat/lng is coarse (city-centroid), so consumers should still
 * encourage the user to confirm or override their pincode manually. Pincode
 * isn't in the Vercel headers — we leave it null here and let the existing
 * Photon/Nominatim reverse-geocode in location-context turn lat/lng into a
 * postcode on the client.
 */
export async function GET(req: NextRequest) {
  const h = req.headers;
  // Vercel populates these on every request hitting the platform — see
  // https://vercel.com/docs/concepts/edge-network/headers
  const country = h.get("x-vercel-ip-country") ?? null;
  const city = decodeMaybe(h.get("x-vercel-ip-city"));
  const region = decodeMaybe(h.get("x-vercel-ip-country-region"));
  const latStr = h.get("x-vercel-ip-latitude");
  const lngStr = h.get("x-vercel-ip-longitude");
  const lat = latStr ? Number(latStr) : null;
  const lng = lngStr ? Number(lngStr) : null;

  const ok =
    Number.isFinite(lat as number) && Number.isFinite(lng as number);

  return NextResponse.json(
    {
      ok,
      // null when the headers were missing — Vercel doesn't set them when
      // running locally with `next dev`. Clients should treat !ok as "no
      // fallback available" and surface the manual picker.
      lat: ok ? lat : null,
      lng: ok ? lng : null,
      city,
      state: region,
      country,
      // Pincode never comes from Vercel — the client re-runs its existing
      // Photon reverse-geocode against the lat/lng to fill this in.
      pincode: null,
    },
    {
      headers: {
        // Don't cache: different users hit this from different IPs.
        "cache-control": "no-store",
      },
    }
  );
}

/** Vercel URI-encodes city names containing non-ASCII characters. */
function decodeMaybe(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}
