import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSid } from "@/lib/tracking";

export const runtime = "nodejs";

/**
 * Pharmacy click handoff.
 *
 * Browsers don't allow our domain to set cookies on pharmacy domains, so we
 * can't transfer the user's pincode directly. We do the next best thing:
 *
 *   1. Append a `pincode` query param to the URL (some pharmacies read it).
 *   2. Render a tiny intermediate HTML page that auto-redirects after ~1.2 s
 *      while reminding the user which pincode to confirm on the pharmacy site.
 *
 * Logged-out users on 1mg / Apollo / PharmEasy / Netmeds will see a "Select
 * delivery location" prompt at the top of the product page — the reminder
 * tells them what to pick.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { pharmacy: string; medicineId: string } }
) {
  const pincode = req.nextUrl.searchParams.get("pincode") ?? null;
  const searchLogId = req.nextUrl.searchParams.get("sl") ?? null;
  const positionParam = req.nextUrl.searchParams.get("pos");
  const position = positionParam ? Number(positionParam) : null;
  const priceParam = req.nextUrl.searchParams.get("p");
  const sellingPriceAtClick = priceParam ? Number(priceParam) : null;
  const mrpParam = req.nextUrl.searchParams.get("m");
  const mrpAtClick = mrpParam ? Number(mrpParam) : null;
  const isCheapest = req.nextUrl.searchParams.get("c") === "1";
  const isJa = req.nextUrl.searchParams.get("ja") === "1";
  const sid = readSid(req);

  const listing = await prisma.pharmacyListing.findFirst({
    where: { pharmacyName: params.pharmacy, medicineId: params.medicineId },
    orderBy: { sellingPrice: "asc" },
  });

  if (!listing?.productUrl) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  prisma.clickLog
    .create({
      data: {
        pharmacyName: params.pharmacy,
        medicineId: params.medicineId,
        productUrl: listing.productUrl,
        sid: sid ?? null,
        searchLogId: searchLogId ?? null,
        position: position != null && Number.isFinite(position) ? position : null,
        sellingPriceAtClick:
          sellingPriceAtClick != null && Number.isFinite(sellingPriceAtClick)
            ? sellingPriceAtClick
            : listing.sellingPrice ?? null,
        mrpAtClick:
          mrpAtClick != null && Number.isFinite(mrpAtClick)
            ? mrpAtClick
            : listing.mrp ?? null,
        isCheapestShown: isCheapest,
        isJanAushadhi: isJa,
        pincode: pincode ?? null,
      },
    })
    .catch(() => {});

  // Append pincode where the URL pattern accepts unknown query params (all do
  // — they ignore params they don't recognise).
  let dest = listing.productUrl;
  if (pincode && /^\d{6}$/.test(pincode)) {
    try {
      const u = new URL(dest);
      u.searchParams.set("pincode", pincode);
      u.searchParams.set("utm_source", "medprice");
      dest = u.toString();
    } catch {
      /* keep original */
    }
  }

  const PHARMACY_LABELS: Record<string, string> = {
    "1mg": "1mg",
    netmeds: "Netmeds",
    pharmeasy: "PharmEasy",
    apollo: "Apollo Pharmacy",
    truemeds: "Truemeds",
    mrmed: "MrMed",
  };
  const label = PHARMACY_LABELS[params.pharmacy] ?? params.pharmacy;

  // Tiny self-contained HTML page with auto-redirect.
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Opening ${label}…</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="1.5;url=${dest.replace(/"/g, "&quot;")}">
<style>
  body{margin:0;background:#06040d;color:#e7e9f1;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .card{max-width:440px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.2);border-radius:20px;padding:28px;text-align:center;backdrop-filter:blur(8px)}
  h1{font-size:20px;margin:0 0 8px;font-weight:700}
  .pin{display:inline-block;background:#a78bfa;color:#06040d;font-weight:700;padding:6px 12px;border-radius:8px;font-family:ui-monospace,monospace;margin:6px 4px}
  p{font-size:14px;color:#a8aac0;line-height:1.5;margin:12px 0}
  .spinner{width:20px;height:20px;border:2px solid rgba(167,139,250,0.3);border-top-color:#a78bfa;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 14px}
  @keyframes spin{to{transform:rotate(360deg)}}
  a{color:#c4b5fd;font-size:13px;display:inline-block;margin-top:14px;text-decoration:none;border-bottom:1px solid rgba(196,181,253,0.4)}
  a:hover{color:#fff}
</style>
</head><body>
<div class="card">
  <div class="spinner"></div>
  <h1>Opening ${label}…</h1>
  ${
    pincode
      ? `<p>When the page loads, make sure your delivery pincode is set to <span class="pin">${pincode}</span> for the price you saw on MedPrice.</p>`
      : `<p>You'll be redirected in a moment. Set your delivery pincode on the pharmacy site for accurate stock and pricing.</p>`
  }
  <a href="${dest.replace(/"/g, "&quot;")}">Continue now →</a>
</div>
<script>setTimeout(function(){window.location.replace(${JSON.stringify(dest)})},1200)</script>
</body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
