import { estimateDelivery } from "@/lib/delivery";
import type { ScrapedListing, ServiceabilityResult } from "../types";
import { check as checkPharmeasy } from "./pharmeasy";
import { check as checkNetmeds } from "./netmeds";
import { check as checkTruemeds } from "./truemeds";
import { check as checkOnemg } from "./onemg";

const SERVICEABILITY_TIMEOUT_MS = 4500;

// Per-pharmacy check functions.
//   - pharmeasy / 1mg now fetch real per-pincode delivery ETAs.
//   - netmeds / truemeds still expose only stock + price (no real ETA found).
//   - mrmed is national-only — no live check.
//   - apollo runs only in the cron worker (browser) and doesn't respond on
//     Vercel; we skip it here.
const CHECKERS: Record<
  string,
  (productUrl: string, pincode: string) => Promise<ServiceabilityResult | null>
> = {
  pharmeasy: checkPharmeasy,
  netmeds: checkNetmeds,
  truemeds: checkTruemeds,
  "1mg": checkOnemg,
};

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[serviceability] ${label} timed out after ${ms}ms`);
      resolve(null);
    }, ms);
  });
  return Promise.race<T | null>([
    p.finally(() => clearTimeout(timer)),
    timeout,
  ]);
}

/**
 * Run per-product serviceability checks for all provided listings in parallel.
 * Returns a Map<pharmacyName, ServiceabilityResult>.
 *
 * IMPORTANT: when a live checker returns `null` (no real ETA available), this
 * function preserves that null. We DO NOT fall back to the static estimate
 * for `deliveryEta` — the caller (the stream / persist path) decides whether
 * to show nothing or fall back to the static heuristic for DB storage only.
 *
 * Stock + serviceability fall back to the listing's own flags + the static
 * tier classification when no live result comes back.
 */
export async function checkAll(
  listings: ScrapedListing[],
  pincode: string
): Promise<Map<string, ServiceabilityResult>> {
  const results = new Map<string, ServiceabilityResult>();

  const tasks = listings.map(async (listing) => {
    const checker = CHECKERS[listing.pharmacyName];
    // Key by productUrl so multiple listings from the same pharmacy (e.g.
    // 15-pack + 30-pack from the per-pack dedup) each carry their own svc.
    // Callers that still want a per-pharmacy lookup can derive it via the
    // helper below.
    const key = listing.productUrl ?? listing.pharmacyName;

    if (!checker || !listing.productUrl) {
      // No live checker — leave deliveryEta null (no fake estimate) and use
      // the static tier classification only for serviceability.
      const eta = estimateDelivery(listing.pharmacyName, pincode);
      results.set(key, {
        inStock: listing.inStock,
        serviceable: eta.serviceable,
        deliveryEta: null,
        source: "static",
      });
      // Also write under pharmacyName for back-compat with callers that
      // still index by pharmacy (only matters when there's exactly one
      // listing per pharmacy, which is the legacy case).
      if (!results.has(listing.pharmacyName)) {
        results.set(listing.pharmacyName, results.get(key)!);
      }
      return;
    }

    try {
      const live = await withTimeout(
        checker(listing.productUrl, pincode),
        SERVICEABILITY_TIMEOUT_MS,
        listing.pharmacyName
      );

      if (live) {
        const eta = estimateDelivery(listing.pharmacyName, pincode);
        const value = {
          ...live,
          // Preserve null deliveryEta — caller decides what to do with it.
          // Only intersect serviceability with the pincode-tier classification
          // so an unserviceable rest-tier pin stays out of stock.
          serviceable: live.serviceable && eta.serviceable,
        };
        results.set(key, value);
        if (!results.has(listing.pharmacyName)) {
          results.set(listing.pharmacyName, value);
        }
      } else {
        // Live check failed or timed out — keep null ETA; surface stock
        // status from the search result.
        const eta = estimateDelivery(listing.pharmacyName, pincode);
        const fallback = {
          inStock: listing.inStock,
          serviceable: eta.serviceable,
          deliveryEta: null,
          source: "static" as const,
        };
        results.set(key, fallback);
        if (!results.has(listing.pharmacyName)) {
          results.set(listing.pharmacyName, fallback);
        }
      }
    } catch (err) {
      console.error(
        `[serviceability] ${listing.pharmacyName} check failed:`,
        (err as Error).message
      );
      const eta = estimateDelivery(listing.pharmacyName, pincode);
      const fallback = {
        inStock: listing.inStock,
        serviceable: eta.serviceable,
        deliveryEta: null,
        source: "static" as const,
      };
      results.set(key, fallback);
      if (!results.has(listing.pharmacyName)) {
        results.set(listing.pharmacyName, fallback);
      }
    }
  });

  await Promise.all(tasks);
  return results;
}
