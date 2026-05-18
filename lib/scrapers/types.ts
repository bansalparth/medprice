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
  /**
   * Unconditional price — what the user actually pays without any conditional
   * coupon (Pharmeasy "assured discount"). When null, `sellingPrice` itself is
   * the unconditional price. Drives the cheapest-pharmacy ranking — we never
   * want to rank a pharmacy as cheapest using a coupon-conditional price.
   */
  baseSellingPrice?: number;
  baseDiscountPercent?: number;
  /**
   * Conditional coupon (e.g. Pharmeasy's MED27PE: 27% off above ₹1000 cart).
   * When present, `sellingPrice` equals `coupon.finalPrice` (post-coupon).
   * Surfaced as a secondary "with COUPON: ₹X — cart ≥ ₹Y" line on the card.
   */
  coupon?: {
    code: string;
    minCartValue?: number;
    appOnly?: boolean;
    finalPrice: number;
    finalDiscountPercent?: number;
  };
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
