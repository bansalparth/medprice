import { fetchText, extractJsonAssignment, parsePrice } from "./http";
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

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  const url = `https://pharmeasy.in/search/all?name=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = { referer: "https://pharmeasy.in/" };
  if (pincode) {
    headers.cookie = `user_pincode=${pincode}; pincode=${pincode}`;
  }
  const html = await fetchText(url, { headers, timeoutMs: 8000 });

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

  return items
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
}
