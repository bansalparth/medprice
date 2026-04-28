import { scrape as scrape1mg } from "./onemg";
import { scrape as scrapeNetmeds } from "./netmeds";
import { scrape as scrapePharmeasy } from "./pharmeasy";
import { scrape as scrapeApollo } from "./apollo";
import { scrape as scrapeTruemeds } from "./truemeds";
import { scrape as scrapeMrmed } from "./mrmed";
import type { ScrapedListing, ScraperFn } from "./types";

export type { ScrapedListing } from "./types";
export { PHARMACIES } from "./types";

interface ScraperEntry {
  name: string;
  fn: ScraperFn;
}

const SCRAPERS: ScraperEntry[] = [
  { name: "1mg", fn: scrape1mg },
  { name: "netmeds", fn: scrapeNetmeds },
  { name: "pharmeasy", fn: scrapePharmeasy },
  { name: "apollo", fn: scrapeApollo },
  { name: "truemeds", fn: scrapeTruemeds },
  { name: "mrmed", fn: scrapeMrmed },
];

/**
 * Pharmacies whose search results / stock badges actually change with the
 * pincode we set via cookie. Used in the UI to flag which prices are truly
 * pincode-aware vs national list pricing.
 */
export const PINCODE_AWARE_PHARMACIES = new Set([
  "1mg",
  "pharmeasy",
  "netmeds",
  "apollo",
]);

export async function scrapeAll(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  const results = await Promise.allSettled(
    SCRAPERS.map((s) => s.fn(query, pincode))
  );

  const successful: ScrapedListing[] = [];
  results.forEach((result, i) => {
    const name = SCRAPERS[i].name;
    if (result.status === "fulfilled") {
      // Drop listings with no price info — they can't participate in comparison
      const priced = result.value.filter(
        (l) => l.sellingPrice != null || l.mrp != null
      );
      console.log(
        `[scrape] ${name}: ${result.value.length} raw, ${priced.length} priced`
      );
      successful.push(...priced);
    } else {
      console.error(`[scrape] ${name} failed:`, result.reason?.message ?? result.reason);
    }
  });

  // Sort ascending by selling price for consistency
  successful.sort((a, b) => {
    const av = a.sellingPrice ?? a.mrp ?? Infinity;
    const bv = b.sellingPrice ?? b.mrp ?? Infinity;
    return av - bv;
  });

  return successful;
}

export async function scrapeOne(
  pharmacy: string,
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  const entry = SCRAPERS.find((s) => s.name === pharmacy);
  if (!entry) throw new Error(`Unknown pharmacy: ${pharmacy}`);
  return entry.fn(query, pincode);
}
