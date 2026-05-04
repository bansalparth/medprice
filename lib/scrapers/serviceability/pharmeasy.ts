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

/**
 * Check PharmEasy stock for a specific product URL.
 * Uses the Next.js data endpoint (/_next/data/{buildId}/...) which returns
 * the same SSR JSON the product page uses. This gives real-time stock status
 * but national pricing (PharmEasy does not expose per-pincode pricing headlessly).
 */
export async function check(
  productUrl: string,
  _pincode: string
): Promise<ServiceabilityResult | null> {
  // Extract slug from productUrl: https://pharmeasy.in/online-medicine-order/{slug}
  const slugMatch = productUrl.match(/online-medicine-order\/([^/?#]+)/);
  if (!slugMatch?.[1]) return null;
  const slug = slugMatch[1];

  const buildId = await getBuildId(slug);
  if (!buildId) return null;

  const dataUrl = `https://pharmeasy.in/_next/data/${buildId}/online-medicine-order/${slug}.json`;
  const data = await fetchJson<PEPageProps>(dataUrl, {
    headers: { referer: `https://pharmeasy.in/online-medicine-order/${slug}` },
    timeoutMs: 5000,
  });

  const pd = data?.pageProps?.productDetails;
  if (!pd) return null;

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
    deliveryEta: null,
    price: price ?? undefined,
    mrp: mrp ?? undefined,
    source: "live",
  };
}
