import { fetchText, extractJsonAssignment, parsePrice } from "./http";
import type { ScrapedListing } from "./types";

interface NMItem {
  type?: string;
  name?: string;
  slug?: string;
  url?: string;
  uid?: string | number;
  item_code?: string | number;
  brand?: { name?: string };
  sellable?: boolean;
  discount?: string;
  price?: {
    effective?: { min?: number; max?: number };
    marked?: { min?: number; max?: number };
  };
  attributes?: {
    name?: string;
    description?: string;
    sellable_quantity?: number;
    quantity?: number;
    netqty?: string;
  };
}

export async function scrape(
  query: string,
  _pincode?: string | null
): Promise<ScrapedListing[]> {
  // Netmeds' search endpoint returns national pricing regardless of any
  // location cookies (verified: pincode/deliveryPincode cookies ignored).
  const url = `https://www.netmeds.com/products?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, {
    headers: { referer: "https://www.netmeds.com/" },
    timeoutMs: 10000,
  });

  const jsonStr = extractJsonAssignment(html, "window.__INITIAL_STATE__=");
  if (!jsonStr) return [];

  let state: any;
  try {
    state = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  const items: NMItem[] =
    state?.productListingPage?.productlists?.items ?? [];

  return items
    .filter((it) => it.type === "product")
    .slice(0, 12)
    .map((it) => {
      const mrp = parsePrice(it.price?.marked?.min);
      const sellingPrice = parsePrice(it.price?.effective?.min) ?? mrp;
      const discountPercent = it.discount
        ? parseInt(String(it.discount).replace(/[^0-9]/g, "")) || undefined
        : mrp && sellingPrice && mrp > sellingPrice
        ? Math.round(((mrp - sellingPrice) / mrp) * 100)
        : undefined;

      // Netmeds' JSON exposes the canonical path in `url` (e.g.
      // "/product/dolo-650-tablet-15s-..."). Fall back to building a path
      // from the slug only if `url` is missing.
      const path = it.url ?? (it.slug ? `/product/${it.slug}` : "");
      const productUrl = path
        ? `https://www.netmeds.com${path.startsWith("/") ? "" : "/"}${path}`
        : `https://www.netmeds.com/products?q=${encodeURIComponent(query)}`;

      const sellable = it.sellable !== false;
      const qty = it.attributes?.sellable_quantity ?? it.attributes?.quantity ?? 0;
      const hasPrice = sellingPrice != null || mrp != null;
      const inStock = sellable && qty > 0 && hasPrice;

      return {
        productName: it.name ?? it.attributes?.name ?? "",
        brandName: it.brand?.name,
        packSize: it.attributes?.netqty,
        mrp,
        sellingPrice,
        discountPercent,
        inStock,
        productUrl,
        pharmacyName: "netmeds",
      } satisfies ScrapedListing;
    })
    .filter((r) => r.productName);
}
