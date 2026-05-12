import { fetchText, fetchJson, parsePrice } from "../http";
import type { ServiceabilityResult } from "../types";

// Cache the Next.js buildId so we only re-fetch it when stale.
let cachedBuildId: string | null = null;
let buildIdFetchedAt = 0;
const BUILD_ID_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getBuildId(productSlug?: string): Promise<string | null> {
  if (cachedBuildId && Date.now() - buildIdFetchedAt < BUILD_ID_TTL_MS) {
    return cachedBuildId;
  }
  // Fetch the product page if we have a slug — more reliable than the home page
  // for extracting the Next.js buildId.
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
    // fallback to cached value even if stale
  }
  return cachedBuildId;
}

interface PEPageProps {
  pageProps?: {
    productDetails?: {
      isAvailable?: boolean;
      productAvailabilityFlags?: { isAvailable?: boolean; notifyMe?: boolean };
      salePrice?: string | number;
      costPrice?: string | number;
      discountPercent?: string | number;
    };
  };
}

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
 *   - Stock/price comes from the SSR `_next/data` JSON.
 *   - Real ETA comes from `/api/otc/fetchOtcEdd/{productId}` (e.g. "Thu 14 May").
 * The two requests run in parallel.
 */
export async function check(
  productUrl: string,
  _pincode: string
): Promise<ServiceabilityResult | null> {
  // Extract slug from productUrl: https://pharmeasy.in/online-medicine-order/{slug}
  const slugMatch = productUrl.match(/online-medicine-order\/([^/?#]+)/);
  if (!slugMatch?.[1]) return null;
  const slug = slugMatch[1];

  // PharmEasy's productId is the trailing -NNNNN segment of the slug.
  const idMatch = slug.match(/-(\d+)$/);
  const productId = idMatch?.[1] ?? null;

  const buildIdPromise = getBuildId(slug);
  const eddPromise = productId ? fetchEdd(productId) : Promise.resolve(null);

  const [buildId, deliveryEta] = await Promise.all([
    buildIdPromise,
    eddPromise,
  ]);

  if (!buildId) {
    // We can still return ETA-only result even without buildId.
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

  const dataUrl = `https://pharmeasy.in/_next/data/${buildId}/online-medicine-order/${slug}.json`;
  const data = await fetchJson<PEPageProps>(dataUrl, {
    headers: { referer: `https://pharmeasy.in/online-medicine-order/${slug}` },
    timeoutMs: 5000,
  }).catch(() => null);

  const pd = data?.pageProps?.productDetails;
  if (!pd) {
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

  const isAvailable =
    pd.isAvailable ??
    pd.productAvailabilityFlags?.isAvailable ??
    true;
  const notifyMe = pd.productAvailabilityFlags?.notifyMe ?? false;
  const inStock = isAvailable && !notifyMe;

  const price = parsePrice(pd.salePrice);
  const mrp = parsePrice(pd.costPrice);

  return {
    inStock,
    serviceable: true,
    deliveryEta,
    price: price ?? undefined,
    mrp: mrp ?? undefined,
    source: "live",
  };
}
