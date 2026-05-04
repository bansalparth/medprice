import { fetchText, parsePrice } from "../http";
import type { ServiceabilityResult } from "../types";

interface NMProductMeta {
  sellable?: boolean;
  sizes?: Array<{ is_available?: boolean; quantity?: number }>;
  price?: {
    effective?: { min?: number; max?: number };
    marked?: { min?: number; max?: number };
  };
  discount_meta?: Record<string, unknown>;
}

interface NMAttributes {
  "mstar-sellingprice"?: number | string;
  "mstar-bestprice"?: number | string;
  mrp?: number | string;
  is_available?: boolean;
}

/**
 * Check Netmeds stock for a specific product URL.
 * Fetches the product page (Vue SSR) and parses __INITIAL_STATE__ for
 * real-time stock + price. Pricing is national (Netmeds does not expose
 * per-pincode pricing headlessly).
 */
export async function check(
  productUrl: string,
  _pincode: string
): Promise<ServiceabilityResult | null> {
  if (!productUrl.includes("netmeds.com")) return null;

  const html = await fetchText(productUrl, {
    headers: { referer: "https://www.netmeds.com/" },
    timeoutMs: 6000,
  });

  // Extract __INITIAL_STATE__
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*)/);
  if (!m) return null;

  const raw = m[1];
  let depth = 0;
  let end = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (!end) return null;

  let state: { productDetailsPage?: { product_meta?: NMProductMeta; product?: { attributes?: NMAttributes } } };
  try {
    state = JSON.parse(raw.slice(0, end));
  } catch {
    return null;
  }

  const meta: NMProductMeta = state?.productDetailsPage?.product_meta ?? {};
  const attrs: NMAttributes = state?.productDetailsPage?.product?.attributes ?? {};

  const sellable = meta.sellable !== false;
  const anyInStock = meta.sizes?.some((s) => s.is_available && (s.quantity ?? 1) > 0) ?? true;
  const isAvailable = attrs.is_available !== false;
  const inStock = sellable && anyInStock && isAvailable;

  const effectivePrice = meta.price?.effective?.min;
  const markedPrice = meta.price?.marked?.min;
  const attrPrice = parsePrice(attrs["mstar-sellingprice"] ?? attrs["mstar-bestprice"]);
  const attrMrp = parsePrice(attrs.mrp);

  const price = effectivePrice ?? attrPrice ?? undefined;
  const mrp = markedPrice ?? attrMrp ?? undefined;

  return {
    inStock,
    serviceable: true,
    deliveryEta: null,
    price,
    mrp,
    source: "live",
  };
}
