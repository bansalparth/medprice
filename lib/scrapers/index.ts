import { scrape as scrapeNetmeds } from "./netmeds";
import { scrape as scrapePharmeasy } from "./pharmeasy";
import { scrape as scrapeApollo } from "./apollo";
import { scrape as scrapeTruemeds } from "./truemeds";
import { scrape as scrapeMrmed } from "./mrmed";
import { scrape as scrapeOnemg } from "./onemg";
import type { ScrapedListing, ScraperFn } from "./types";

export type { ScrapedListing } from "./types";
export { PHARMACIES } from "./types";

interface ScraperEntry {
  name: string;
  fn: ScraperFn;
  // HTTP scrapers hit JSON APIs directly — fast, cheap, work on Vercel.
  // Browser scrapers need Playwright + Chromium and only run in the
  // GH Actions cron worker.
  kind: "http" | "browser";
}

const SCRAPERS: ScraperEntry[] = [
  { name: "netmeds", fn: scrapeNetmeds, kind: "http" },
  { name: "pharmeasy", fn: scrapePharmeasy, kind: "http" },
  { name: "truemeds", fn: scrapeTruemeds, kind: "http" },
  { name: "mrmed", fn: scrapeMrmed, kind: "http" },
  { name: "1mg", fn: scrapeOnemg, kind: "http" },
  { name: "apollo", fn: scrapeApollo, kind: "browser" },
];

/**
 * Pharmacies whose search results / stock badges actually change with the
 * pincode we set. Used in the UI to flag which prices are truly
 * pincode-aware vs national list pricing.
 */
export const PINCODE_AWARE_PHARMACIES = new Set([
  "1mg",
  "truemeds",
  "apollo",
  "pharmeasy",
  "netmeds",
]);

// Hard ceiling per pharmacy — if one site hangs, fail it fast so the rest
// of the scrape completes within the function's wall-clock budget.
const PER_SCRAPER_TIMEOUT_MS = parseInt(
  process.env.PER_SCRAPER_TIMEOUT_MS ?? "10000",
  10
);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export interface ScrapeAllOpts {
  // Include the Playwright-based scrapers (Apollo, Truemeds, MrMed). Only
  // safe in environments with a real Chromium binary — the cron worker.
  includeBrowser?: boolean;
}

export async function scrapeAll(
  query: string,
  pincode?: string | null,
  opts: ScrapeAllOpts = {}
): Promise<ScrapedListing[]> {
  const active = SCRAPERS.filter(
    (s) => s.kind === "http" || (opts.includeBrowser && s.kind === "browser")
  );

  // HTTP scrapers are independent and cheap — fire all in parallel.
  const tasks = active.map((s) =>
    withTimeout(s.fn(query, pincode), PER_SCRAPER_TIMEOUT_MS, s.name)
  );
  const results = await Promise.allSettled(tasks);

  const successful: ScrapedListing[] = [];
  results.forEach((result, i) => {
    const name = active[i].name;
    if (result.status === "fulfilled") {
      const priced = result.value.filter(
        (l) => l.sellingPrice != null || l.mrp != null
      );
      console.log(
        `[scrape] ${name}: ${result.value.length} raw, ${priced.length} priced`
      );
      successful.push(...priced);
    } else {
      console.error(
        `[scrape] ${name} failed:`,
        result.reason?.message ?? result.reason
      );
    }
  });

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
