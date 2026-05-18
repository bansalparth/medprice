import { fetchText, fetchJson, parsePrice } from "./http";

/**
 * Shared helpers for hitting Pharmeasy's per-product `_next/data` JSON.
 *
 * Used by:
 *   - lib/scrapers/serviceability/pharmeasy.ts (real ETA + price/stock check)
 *   - lib/scrapers/pharmeasy.ts (coupon enrichment after search)
 *
 * Pharmeasy's search endpoint returns `salePriceDecimal` that already includes
 * the best conditional coupon (e.g. MED27PE: 27% off above ₹1000 cart). To rank
 * pharmacies honestly we need the *unconditional* price too. That lives on the
 * product detail page as `productDetails.assuredDiscountPrice`, alongside the
 * `bestOfferDetails` block describing the conditional coupon.
 */

let cachedBuildId: string | null = null;
let buildIdFetchedAt = 0;
const BUILD_ID_TTL_MS = 60 * 60 * 1000;

export async function getBuildId(productSlug?: string): Promise<string | null> {
  if (cachedBuildId && Date.now() - buildIdFetchedAt < BUILD_ID_TTL_MS) {
    return cachedBuildId;
  }
  const url = productSlug
    ? `https://pharmeasy.in/online-medicine-order/${productSlug}`
    : "https://pharmeasy.in/search/all?name=dolo+650";
  try {
    const html = await fetchText(url, {
      headers: { referer: "https://pharmeasy.in/" },
      timeoutMs: 8000,
    });
    const m = html.match(/"buildId"\s*:\s*"([^"]+)"/);
    if (m?.[1]) {
      cachedBuildId = m[1];
      buildIdFetchedAt = Date.now();
      return cachedBuildId;
    }
  } catch {
    // fallback to cached value
  }
  return cachedBuildId;
}

interface PEProductDataRaw {
  pageProps?: {
    productDetails?: {
      isAvailable?: boolean;
      productAvailabilityFlags?: { isAvailable?: boolean; notifyMe?: boolean };
      costPrice?: string | number;
      salePrice?: string | number;
      discountPercent?: string | number;
      assuredDiscountPrice?: string | number;
      assuredDiscountPercent?: string | number;
      isBestOfferApplied?: boolean;
    };
    bestOfferDetails?: {
      promoCode?: string;
      title?: string;
      shortDescription?: string;
      couponMrpThreshold?: string | number;
    };
  };
}

export interface PEProductOffer {
  /** MRP. */
  costPrice: number | null;
  /** Price after the best conditional coupon was applied. */
  salePrice: number | null;
  /** Discount % shown on Pharmeasy's tile (post-coupon). */
  discountPercent: number | null;
  /** Unconditional price — what user actually pays without any coupon. */
  assuredDiscountPrice: number | null;
  assuredDiscountPercent: number | null;
  /**
   * True when `salePrice` already includes a conditional coupon. False / undefined
   * means `salePrice == assuredDiscountPrice` (no conditional offer in play).
   */
  isBestOfferApplied: boolean;
  /** The conditional coupon block, or null when none is active. */
  coupon: {
    code: string;
    minCartValue: number | null;
    title: string | null;
  } | null;
  inStock: boolean;
}

/**
 * Fetch + parse a single Pharmeasy product's `_next/data` JSON, extracting
 * stock, prices, and the conditional-coupon block. Returns null on any failure
 * — callers should fall back to using the search-result price as-is.
 */
export async function fetchProductOffer(
  slug: string,
  timeoutMs = 6000
): Promise<PEProductOffer | null> {
  const buildId = await getBuildId(slug);
  if (!buildId) return null;

  const url = `https://pharmeasy.in/_next/data/${buildId}/online-medicine-order/${slug}.json`;
  const data = await fetchJson<PEProductDataRaw>(url, {
    headers: { referer: `https://pharmeasy.in/online-medicine-order/${slug}` },
    timeoutMs,
  }).catch(() => null);
  if (!data?.pageProps?.productDetails) return null;

  const pd = data.pageProps.productDetails;
  const isAvailable =
    pd.isAvailable ?? pd.productAvailabilityFlags?.isAvailable ?? true;
  const notifyMe = pd.productAvailabilityFlags?.notifyMe ?? false;

  const best = data.pageProps.bestOfferDetails;
  const minCart = best?.couponMrpThreshold
    ? parsePrice(best.couponMrpThreshold) ?? null
    : null;

  const couponCode = best?.promoCode?.trim() || null;
  const isBestOfferApplied = pd.isBestOfferApplied === true;

  return {
    costPrice: parsePrice(pd.costPrice) ?? null,
    salePrice: parsePrice(pd.salePrice) ?? null,
    discountPercent: parsePrice(pd.discountPercent) ?? null,
    assuredDiscountPrice: parsePrice(pd.assuredDiscountPrice) ?? null,
    assuredDiscountPercent: parsePrice(pd.assuredDiscountPercent) ?? null,
    isBestOfferApplied,
    coupon:
      couponCode && isBestOfferApplied
        ? {
            code: couponCode,
            minCartValue: minCart,
            title: best?.title?.trim() || null,
          }
        : null,
    inStock: isAvailable && !notifyMe,
  };
}

/** Extract the slug from a Pharmeasy product URL. */
export function slugFromUrl(productUrl: string): string | null {
  const m = productUrl.match(/online-medicine-order\/([^/?#]+)/);
  return m?.[1] ?? null;
}
