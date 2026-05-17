import { fetchJson, parsePrice } from "./http";
import type { ScrapedListing } from "./types";
import { pincodeToCity } from "@/lib/pincode";

interface OneMgResult {
  id: string | number;
  name?: string;
  type?: string;
  available?: boolean;
  url?: string;
  label?: string;
  prices?: {
    mrp?: string | number;
    discounted_price?: string | number | null;
    discount?: string | null;
    best_price?: {
      tags?: Array<{
        mix_panel_data?: {
          sku_list_price?: number;
          sku_coupon_price?: number;
          sku_best_price?: number;
        };
      }>;
    } | null;
  };
  not_available_tag?: { text?: string } | null;
  cta?: { text?: string } | null;
  manufacturer?: string;
}

interface OneMgResponse {
  is_success?: boolean;
  data?: { search_results?: OneMgResult[] };
}

function cityFor(pincode?: string | null): string {
  if (!pincode) return "Mumbai";
  return pincodeToCity(pincode);
}

export async function scrape(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  const city = cityFor(pincode);
  const url =
    "https://www.1mg.com/pwa-api/api/v4/search/all" +
    `?q=${encodeURIComponent(query)}` +
    `&city=${encodeURIComponent(city)}` +
    "&types=sku&page=1&per_page=15";

  const headers: Record<string, string> = {
    referer: "https://www.1mg.com/",
    "x-city": city,
  };
  if (pincode) headers["x-pincode"] = pincode;

  const json = await fetchJson<OneMgResponse>(url, {
    headers,
    timeoutMs: 8000,
  });

  const results = json?.data?.search_results ?? [];

  return results
    .filter((r) => r.type === "drug" || r.type === "otc")
    .slice(0, 12)
    .map((r) => {
      const mrp = parsePrice(r.prices?.mrp);
      let sellingPrice = parsePrice(r.prices?.discounted_price);
      if (sellingPrice == null && r.prices?.best_price?.tags?.length) {
        sellingPrice = parsePrice(
          r.prices.best_price.tags[0]?.mix_panel_data?.sku_list_price
        );
      }
      sellingPrice = sellingPrice ?? mrp;
      const discountStr = r.prices?.discount;
      const discountPercent = discountStr
        ? parseInt(String(discountStr).replace(/[^0-9]/g, "")) || undefined
        : mrp && sellingPrice && mrp > sellingPrice
        ? (Math.round(((mrp - sellingPrice) / mrp) * 100) || undefined)
        : undefined;

      const path = r.url ?? "";
      const productUrl = path.startsWith("http")
        ? path
        : `https://www.1mg.com${path}`;

      // 1mg's `available` flag is the source of truth; cross-check against
      // not_available_tag (e.g. "Discontinued") and cta text ("Notify Me").
      const notAvailTag = (r.not_available_tag?.text ?? "").toLowerCase();
      const ctaText = (r.cta?.text ?? "").toLowerCase();
      const flaggedUnavailable =
        /out of stock|discontinued|notify|sold out|not for sale|unavailable/i.test(
          notAvailTag + " " + ctaText
        );
      const hasPrice = sellingPrice != null || mrp != null;
      const inStock = !!r.available && !flaggedUnavailable && hasPrice;

      return {
        productName: r.name ?? "",
        brandName: undefined,
        packSize: r.label,
        mrp,
        sellingPrice,
        discountPercent,
        inStock,
        productUrl,
        pharmacyName: "1mg",
      } satisfies ScrapedListing;
    })
    .filter((r) => r.productName);
}
