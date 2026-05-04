import { fetchText, fetchJson, parsePrice } from "../http";
import type { ServiceabilityResult } from "../types";

let cachedBuildId: string | null = null;
let buildIdFetchedAt = 0;
const BUILD_ID_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getBuildId(productUrl: string): Promise<string | null> {
  if (cachedBuildId && Date.now() - buildIdFetchedAt < BUILD_ID_TTL_MS) {
    return cachedBuildId;
  }
  try {
    const html = await fetchText(productUrl, {
      headers: { referer: "https://www.truemeds.in/" },
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

interface TMProduct {
  available?: boolean;
  availabilityStatus?: string | null;
  sellingPrice?: number | string;
  mrp?: number | string;
  skuName?: string;
}

interface TMPageProps {
  currentMed?: { product?: TMProduct };
  originalMedicineDetails?: { product?: TMProduct };
}

/**
 * Check TrueMeds stock via the Next.js data endpoint (_next/data/…).
 * Fetches the product page once to get the buildId (cached 1hr), then
 * calls the lightweight JSON endpoint for subsequent checks.
 */
export async function check(
  productUrl: string,
  _pincode: string
): Promise<ServiceabilityResult | null> {
  if (!productUrl.includes("truemeds.in")) return null;

  // Extract the path after truemeds.in: e.g. "otc/dolo-650-mg-tablet-15-tm-tacr1-011691"
  const pathMatch = productUrl.match(/truemeds\.in\/(.+)/);
  if (!pathMatch?.[1]) return null;
  const productPath = pathMatch[1].replace(/\/$/, "");

  const buildId = await getBuildId(productUrl);
  if (!buildId) return null;

  const dataUrl = `https://www.truemeds.in/_next/data/${buildId}/${productPath}.json`;
  const data = await fetchJson<{ pageProps?: TMPageProps }>(dataUrl, {
    headers: { referer: productUrl },
    timeoutMs: 5000,
  });

  const pp = data?.pageProps;
  const product =
    pp?.currentMed?.product ?? pp?.originalMedicineDetails?.product;
  if (!product) return null;

  const availabilityStatus = (product.availabilityStatus ?? "").toLowerCase();
  const inStock =
    product.available !== false &&
    !/out of stock|unavailable/i.test(availabilityStatus);

  return {
    inStock,
    serviceable: true,
    deliveryEta: null,
    price: parsePrice(product.sellingPrice) ?? undefined,
    mrp: parsePrice(product.mrp) ?? undefined,
    source: "live",
  };
}
