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

// Map pincode prefix → Truemeds zone code (Maharashtra default covers Mumbai).
// Without a zone param the API returns 0 results for non-Indian IPs.
const PINCODE_TO_ZONE: Record<string, string> = {
  "110": "DL", // Delhi
  "400": "MH", // Mumbai
  "500": "TS", // Hyderabad
  "560": "KA", // Bangalore
  "600": "TN", // Chennai
  "700": "WB", // Kolkata
  "411": "MH", // Pune
};

function zoneFor(pincode?: string | null): string {
  if (pincode) {
    const zone = PINCODE_TO_ZONE[pincode.slice(0, 3)];
    if (zone) return zone;
  }
  return "MH"; // default: Maharashtra/Mumbai
}

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  const zone = zoneFor(pincode);
  const url =
    "https://nal.tmmumbai.in/SearchService/getSearchResult" +
    `?searchString=${encodeURIComponent(query)}&zone=${zone}`;

  let json: TMResponse;
  try {
    json = await fetchJson<TMResponse>(url, {
      headers: {
        referer: "https://www.truemeds.in/",
        origin: "https://www.truemeds.in",
      },
      timeoutMs: 8000,
    });
  } catch {
    return [];
  }

  const items = json?.responseData?.elasticProductDetails ?? [];

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
