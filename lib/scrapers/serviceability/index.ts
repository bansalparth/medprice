import { estimateDelivery } from "@/lib/delivery";
import type { ScrapedListing, ServiceabilityResult } from "../types";
import { check as checkPharmeasy } from "./pharmeasy";
import { check as checkNetmeds } from "./netmeds";
import { check as checkTruemeds } from "./truemeds";

const SERVICEABILITY_TIMEOUT_MS = 4500;

// Per-pharmacy check functions. Apollo is already pincode-aware (Playwright),
// 1mg prices are already location-specific via city/x-pincode headers on the
// search API, and MrMed is national-only — those three don't need separate
// product-page checks.
const CHECKERS: Record<
  string,
  (productUrl: string, pincode: string) => Promise<ServiceabilityResult | null>
> = {
  pharmeasy: checkPharmeasy,
  netmeds: checkNetmeds,
  truemeds: checkTruemeds,
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
 * Returns a Map<pharmacyName, ServiceabilityResult> with live results where
 * available, falling back to static estimates from lib/delivery.ts.
 */
export async function checkAll(
  listings: ScrapedListing[],
  pincode: string
): Promise<Map<string, ServiceabilityResult>> {
  const results = new Map<string, ServiceabilityResult>();

  const tasks = listings.map(async (listing) => {
    const checker = CHECKERS[listing.pharmacyName];

    if (!checker || !listing.productUrl) {
      // No live checker — use static estimate
      const eta = estimateDelivery(listing.pharmacyName, pincode);
      results.set(listing.pharmacyName, {
        inStock: listing.inStock,
        serviceable: eta.serviceable,
        deliveryEta: eta.eta,
        source: "static",
      });
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
        results.set(listing.pharmacyName, {
          ...live,
          // Always populate ETA (live checker returns null, use static)
          deliveryEta: live.deliveryEta ?? eta.eta,
          serviceable: live.serviceable && eta.serviceable,
        });
      } else {
        // Timeout or null — fall back to static
        const eta = estimateDelivery(listing.pharmacyName, pincode);
        results.set(listing.pharmacyName, {
          inStock: listing.inStock,
          serviceable: eta.serviceable,
          deliveryEta: eta.eta,
          source: "static",
        });
      }
    } catch (err) {
      console.error(
        `[serviceability] ${listing.pharmacyName} check failed:`,
        (err as Error).message
      );
      const eta = estimateDelivery(listing.pharmacyName, pincode);
      results.set(listing.pharmacyName, {
        inStock: listing.inStock,
        serviceable: eta.serviceable,
        deliveryEta: eta.eta,
        source: "static",
      });
    }
  });

  await Promise.all(tasks);
  return results;
}
