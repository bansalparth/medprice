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
