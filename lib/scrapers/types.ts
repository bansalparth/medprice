export interface ServiceabilityResult {
  inStock: boolean;
  serviceable: boolean;
  /** Human-readable ETA: "Tomorrow", "2-3 days", "May 7". Null → use static fallback. */
  deliveryEta: string | null;
  /** Exact calendar date string "Wed, May 7" when known. */
  deliveryDate?: string;
  /** Location-specific selling price (if different from national search price). */
  price?: number;
  mrp?: number;
  /** Whether this result came from a live product-page check or static estimate. */
  source: "live" | "static";
}

export interface ScrapedListing {
  productName: string;
  brandName?: string;
  saltComposition?: string;
  packSize?: string;
  mrp?: number;
  sellingPrice?: number;
  discountPercent?: number;
  inStock: boolean;
  productUrl: string;
  pharmacyName: string;
}

export type ScraperFn = (
  query: string,
  pincode?: string | null
) => Promise<ScrapedListing[]>;

export const PHARMACIES = [
  "netmeds",
  "pharmeasy",
  "truemeds",
  "mrmed",
  "1mg",
  "apollo",
] as const;

export type PharmacyName = (typeof PHARMACIES)[number];
