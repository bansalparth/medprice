import { fetchText, extractJsonAssignment, parsePrice } from "./http";
import { fetchProductOffer, slugFromUrl } from "./pharmeasy-product";
import type { ScrapedListing } from "./types";

interface PEItem {
  productId?: number | string;
  productType?: number;
  entityType?: number;
  name?: string;
  slug?: string;
  measurementUnit?: string;
  packform?: string;
  manufacturer?: string;
  moleculeName?: string;
  mrpDecimal?: string | number;
  salePriceDecimal?: string | number;
  discountPercent?: string | number;
  productAvailabilityFlags?: { isAvailable?: boolean; notifyMe?: boolean };
}

// Per-SKU offer cache so basket scrapes don't re-fetch PDPs hit during
// single-product search. Memory-only — TTL aligned with the DB FRESH window.
const OFFER_TTL_MS = 30 * 60 * 1000;
const offerCache = new Map<
  string,
  { at: number; value: Awaited<ReturnType<typeof fetchProductOffer>> }
>();

async function fetchOfferCached(slug: string) {
  const hit = offerCache.get(slug);
  if (hit && Date.now() - hit.at < OFFER_TTL_MS) return hit.value;
  const value = await fetchProductOffer(slug);
  offerCache.set(slug, { at: Date.now(), value });
  return value;
}

// Bounded-concurrency map. We only enrich up to N concurrently to avoid hammering
// pharmeasy.in — they happily 429 on tight bursts.
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

export async function scrape(
  query: string,
  _pincode?: string | null
): Promise<ScrapedListing[]> {
  // PharmEasy's search endpoint returns national pricing regardless of any
  // location cookies (verified: pincode/_cg/user_pincode all ignored — server
  // always responds with default Mumbai context). Pincode is therefore unused.
  const url = `https://pharmeasy.in/search/all?name=${encodeURIComponent(query)}`;
  const html = await fetchText(url, {
    headers: { referer: "https://pharmeasy.in/" },
    timeoutMs: 8000,
  });

  const jsonStr = extractJsonAssignment(
    html,
    '<script id="__NEXT_DATA__" type="application/json">'
  );
  if (!jsonStr) return [];

  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  const items: PEItem[] = data?.props?.pageProps?.searchResults ?? [];

  const baseListings: ScrapedListing[] = items
    .filter((it) => it.productType === 1 || it.entityType === 2)
    .slice(0, 12)
    .map((it) => {
      const mrp = parsePrice(it.mrpDecimal);
      const sellingPrice = parsePrice(it.salePriceDecimal) ?? mrp;
      const discountPercent =
        parsePrice(it.discountPercent) ??
        (mrp && sellingPrice && mrp > sellingPrice
          ? Math.round(((mrp - sellingPrice) / mrp) * 100)
          : undefined);

      const slug = it.slug ?? "";
      const productUrl = `https://pharmeasy.in/online-medicine-order/${slug}`;

      const isAvailable = it.productAvailabilityFlags?.isAvailable !== false;
      const notify = it.productAvailabilityFlags?.notifyMe === true;
      const hasPrice = sellingPrice != null || mrp != null;
      const inStock = isAvailable && !notify && hasPrice;

      return {
        productName: it.name ?? "",
        brandName: undefined,
        saltComposition: it.moleculeName,
        packSize: it.measurementUnit ?? it.packform,
        mrp,
        sellingPrice,
        discountPercent: discountPercent
          ? Math.round(Number(discountPercent))
          : undefined,
        inStock,
        productUrl,
        pharmacyName: "pharmeasy",
      } satisfies ScrapedListing;
    })
    .filter((r) => r.productName);

  // Enrich each in-stock listing with its conditional-coupon block from the PDP.
  // The search endpoint's `salePriceDecimal` already includes Pharmeasy's best
  // coupon (e.g. MED27PE: cart ≥ ₹1000). To rank pharmacies honestly we need
  // the unconditional "assured" price as well — that only lives on the PDP.
  await mapConcurrent(baseListings, 4, async (listing) => {
    const slug = slugFromUrl(listing.productUrl);
    if (!slug) return;
    let offer: Awaited<ReturnType<typeof fetchProductOffer>> | null = null;
    try {
      offer = await fetchOfferCached(slug);
    } catch {
      offer = null;
    }
    if (!offer) return; // keep listing as-is; PriceCard will fall back

    const assured = offer.assuredDiscountPrice ?? null;
    const assuredPct = offer.assuredDiscountPercent ?? null;
    const couponFinal = offer.salePrice ?? null;
    const searchPrice = listing.sellingPrice ?? null;

    // Sanity check: the PDP's default-variant salePrice must roughly match the
    // search row's sellingPrice. If they're more than 25% off, the PDP picked
    // a different variant than what search surfaced (e.g. search returned the
    // 15-tab strip's price but PDP's default is the 30-tab pack). In that case
    // bail — enrichment would mismatch units and the card would look wrong.
    if (searchPrice != null && couponFinal != null) {
      const ratio = Math.max(searchPrice, couponFinal) /
        Math.max(1, Math.min(searchPrice, couponFinal));
      if (ratio > 1.25) return;
    }

    // Only treat this as a conditional offer if Pharmeasy explicitly says so AND
    // the post-coupon price is strictly cheaper than the assured price. If they
    // match, there's no actionable coupon and we leave the listing flat.
    if (
      offer.coupon &&
      assured != null &&
      couponFinal != null &&
      couponFinal < assured
    ) {
      listing.baseSellingPrice = assured;
      listing.baseDiscountPercent = assuredPct ?? undefined;
      listing.coupon = {
        code: offer.coupon.code,
        minCartValue: offer.coupon.minCartValue ?? undefined,
        finalPrice: couponFinal,
        finalDiscountPercent: offer.discountPercent ?? undefined,
      };
    } else if (assured != null) {
      // No active conditional coupon — but still record assured as the base so
      // downstream code can normalize.
      listing.baseSellingPrice = assured;
      listing.baseDiscountPercent = assuredPct ?? undefined;
    }
  });

  return baseListings;
}
