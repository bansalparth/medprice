import { fetchText, extractJsonAssignment, parsePrice } from "./http";
import type { ScrapedListing } from "./types";

interface NMItem {
  type?: string;
  name?: string;
  slug?: string;
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
  pincode?: string | null
): Promise<ScrapedListing[]> {
  const url = `https://www.netmeds.com/products?q=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = { referer: "https://www.netmeds.com/" };
  if (pincode) {
    headers.cookie = `pincode=${pincode}; deliveryPincode=${pincode}`;
  }
  const html = await fetchText(url, { headers, timeoutMs: 10000 });

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

      const slug = it.slug ?? "";
      const productUrl = slug
        ? `https://www.netmeds.com/prescriptions/${slug}`
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
