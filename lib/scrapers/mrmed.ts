import { fetchJson, parsePrice } from "./http";
import type { ScrapedListing } from "./types";

interface MrMedStock {
  stock?: boolean;
  availability?: string;
  quantity?: number;
  reason?: string | null;
}

interface MrMedProduct {
  product_name?: string | null;
  mrp?: number | null;
  price_to_customer?: number | null;
  discount?: number | null;
  stock?: MrMedStock | null;
  packing_display?: string | null;
  slug?: string;
  molecule_name?: string | null;
}

interface MrMedResponse {
  statusCode?: number;
  data?: { products?: MrMedProduct[] };
}

export async function scrape(
  query: string,
  _pincode?: string | null
): Promise<ScrapedListing[]> {
  // MrMed's API returns national pricing — pincode/x-pincode have no effect.
  const url =
    "https://api.mrmeds.in/product/v2/search" +
    `?searchText=${encodeURIComponent(query)}&page=1&limit=20`;

  let json: MrMedResponse;
  try {
    json = await fetchJson<MrMedResponse>(url, {
      headers: {
        referer: "https://www.mrmed.in/",
        origin: "https://www.mrmed.in",
      },
      timeoutMs: 8000,
    });
  } catch {
    return [];
  }

  const products = json?.data?.products ?? [];

  return products
    .filter((p) => !!p.product_name)
    .slice(0, 12)
    .map((p) => {
      const mrp = parsePrice(p.mrp);
      const sellingPrice = parsePrice(p.price_to_customer) ?? mrp;
      const discountPercent =
        p.discount != null
          ? Math.round(p.discount)
          : mrp && sellingPrice && mrp > sellingPrice
          ? Math.round(((mrp - sellingPrice) / mrp) * 100)
          : undefined;

      const hasPrice = sellingPrice != null || mrp != null;
      const inStock =
        p.stock?.stock === true &&
        p.stock?.availability === "available" &&
        hasPrice;

      const slug = p.slug ?? "";
      const productUrl = slug
        ? `https://www.mrmed.in/medicines/${slug}`
        : `https://www.mrmed.in/search?searchText=${encodeURIComponent(query)}`;

      return {
        productName: p.product_name!,
        saltComposition: p.molecule_name ?? undefined,
        packSize: p.packing_display ?? undefined,
        mrp,
        sellingPrice,
        discountPercent,
        inStock,
        productUrl,
        pharmacyName: "mrmed",
      } satisfies ScrapedListing;
    });
}
