import { fetchJson } from "../http";
import { fetchProductOffer, slugFromUrl } from "../pharmeasy-product";
import type { ServiceabilityResult } from "../types";

interface PEEddResponse {
  edd?: {
    deliverySpeed?: string;
    text?: string; // e.g. "Delivery by "
    time?: string; // e.g. "Thu 14 May, before 11:00 pm"
    minEddTime?: string; // ISO
    maxEddTime?: string; // ISO
    quickDeliveryEnabled?: boolean;
  };
}

/**
 * Fetch the real per-product delivery ETA from PharmEasy's OTC EDD endpoint.
 * Format example: "Delivery by Thu 14 May, before 11:00 pm".
 * The endpoint accepts no pincode header today — PharmEasy resolves the
 * pincode from the calling IP / their internal default. We still expose
 * a pincode arg in case they enable it later.
 */
async function fetchEdd(productId: string): Promise<string | null> {
  try {
    const data = await fetchJson<PEEddResponse>(
      `https://pharmeasy.in/api/otc/fetchOtcEdd/${productId}`,
      {
        headers: {
          referer: "https://pharmeasy.in/",
          "user-agent": "Mozilla/5.0",
        },
        timeoutMs: 5000,
      }
    );
    const time = data?.edd?.time?.trim();
    const text = data?.edd?.text?.trim();
    if (!time) return null;
    return text ? `${text.replace(/\s+$/, "")} ${time}` : time;
  } catch {
    return null;
  }
}

/**
 * Check PharmEasy stock + real delivery ETA for a specific product URL.
 *   - Stock/price comes from the SSR `_next/data` JSON (via fetchProductOffer).
 *   - Real ETA comes from `/api/otc/fetchOtcEdd/{productId}` (e.g. "Thu 14 May").
 * The two requests run in parallel.
 */
export async function check(
  productUrl: string,
  _pincode: string
): Promise<ServiceabilityResult | null> {
  const slug = slugFromUrl(productUrl);
  if (!slug) return null;

  // PharmEasy's productId is the trailing -NNNNN segment of the slug.
  const idMatch = slug.match(/-(\d+)$/);
  const productId = idMatch?.[1] ?? null;

  const offerPromise = fetchProductOffer(slug);
  const eddPromise = productId ? fetchEdd(productId) : Promise.resolve(null);

  const [offer, deliveryEta] = await Promise.all([offerPromise, eddPromise]);

  if (!offer) {
    if (deliveryEta) {
      return {
        inStock: true,
        serviceable: true,
        deliveryEta,
        source: "live",
      };
    }
    return null;
  }

  // For serviceability we report the *unconditional* price (assured) when
  // available, so cheapest-pharmacy ranking isn't skewed by a coupon-conditional
  // price. The full coupon block is captured by the search-time enrichment.
  const price =
    offer.assuredDiscountPrice ?? offer.salePrice ?? undefined;

  return {
    inStock: offer.inStock,
    serviceable: true,
    deliveryEta,
    price: price ?? undefined,
    mrp: offer.costPrice ?? undefined,
    source: "live",
  };
}
