import { fetchJson, parsePrice } from "./http";
import type { ScrapedListing } from "./types";

interface TMProduct {
  skuName?: string;
  mrp?: number;
  sellingPrice?: number;
  discount?: number;
  available?: boolean;
  availabilityStatus?: string | null;
  packForm?: string;
  productUrlSuffix?: string;
  composition?: string;
}

interface TMResponse {
  responseData?: {
    elasticProductDetails?: Array<{ product?: TMProduct }>;
  };
}

export async function scrape(
  query: string,
  _pincode?: string | null
): Promise<ScrapedListing[]> {
  const url =
    "https://nal.tmmumbai.in/SearchService/getSearchResult" +
    `?searchString=${encodeURIComponent(query)}`;

  let json: TMResponse;
  try {
    json = await fetchJson<TMResponse>(url, {
      headers: {
        referer: "https://www.truemeds.in/",
        origin: "https://www.truemeds.in",
        "x-requested-with": "XMLHttpRequest",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        // Hint server we're calling from India (geo-IP check bypass)
        "x-forwarded-for": "49.249.60.1",
        "cf-ipcountry": "IN",
        "x-country": "IN",
      },
      timeoutMs: 8000,
    });
  } catch {
    return [];
  }

  const items = json?.responseData?.elasticProductDetails ?? [];
  console.log(`[truemeds] raw response keys: ${Object.keys(json ?? {}).join(",")}, items: ${items.length}`);

  const out: ScrapedListing[] = [];
  for (const entry of items.slice(0, 6)) {
    const p = entry.product;
    if (!p?.skuName) continue;

    const mrp = parsePrice(p.mrp);
    const sellingPrice = parsePrice(p.sellingPrice) ?? mrp;
    const discountPercent =
      p.discount != null
        ? Math.round(p.discount)
        : mrp && sellingPrice && mrp > sellingPrice
        ? Math.round(((mrp - sellingPrice) / mrp) * 100)
        : undefined;

    const hasPrice = sellingPrice != null || mrp != null;
    const unavailable = /out of stock|unavailable/i.test(
      p.availabilityStatus ?? ""
    );
    const inStock = p.available === true && !unavailable && hasPrice;

    const suffix = p.productUrlSuffix ?? "";
    const productUrl = suffix
      ? `https://www.truemeds.in/${suffix}`
      : `https://www.truemeds.in/search/${encodeURIComponent(query)}`;

    out.push({
      productName: p.skuName,
      saltComposition: p.composition,
      packSize: p.packForm,
      mrp,
      sellingPrice,
      discountPercent,
      inStock,
      productUrl,
      pharmacyName: "truemeds",
    });
  }
  return out;
}
