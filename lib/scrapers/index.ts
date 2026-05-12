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
 * Pharmacies whose search results actually change with the pincode/city we
 * pass. Verified empirically:
 *   - 1mg:    city + x-pincode headers → different discounted prices per city
 *             (e.g. Delhi ₹28.7 vs Mumbai ₹30.6 for Dolo 650). Confirmed by
 *             curl tests 2026-05-05.
 *   - Apollo: cookie-injected pincode → location-specific stock and pricing.
 *   - PharmEasy/Netmeds/TrueMeds: search APIs return national pricing only.
 *   - MrMed:  national API, no location support.
 */
export const PINCODE_AWARE_PHARMACIES = new Set(["1mg", "apollo"]);

// Hard ceiling per pharmacy — if one site hangs, fail it fast so the rest
// of the scrape completes within the function's wall-clock budget. Default
// dropped from 10s → 5s: site failure modes (DNS hangs, TLS handshakes)
// rarely recover, and 5s is still well above the p95 success latency of the
// healthy HTTP scrapers (~1–3s).
const PER_SCRAPER_TIMEOUT_MS = parseInt(
  process.env.PER_SCRAPER_TIMEOUT_MS ?? "5000",
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

/**
 * Streaming variant: invokes `onPharmacy(name, listings)` the moment each
 * pharmacy resolves (or returns nothing on timeout / error). Returns the
 * aggregated list of all priced listings after every pharmacy has either
 * completed or timed out — same shape as `scrapeAll` for back-compat.
 *
 * Use this when you want to emit per-pharmacy chunks to the client over
 * NDJSON before the slowest pharmacy finishes.
 */
export async function scrapeAllStream(
  query: string,
  pincode: string | null | undefined,
  onPharmacy: (
    pharmacy: string,
    listings: ScrapedListing[]
  ) => void | Promise<void>,
  opts: ScrapeAllOpts = {}
): Promise<ScrapedListing[]> {
  const active = SCRAPERS.filter(
    (s) => s.kind === "http" || (opts.includeBrowser && s.kind === "browser")
  );

  const aggregated: ScrapedListing[] = [];

  // Each pharmacy is its own promise: scrape → filter to priced → callback.
  // The promise resolves only after onPharmacy is awaited so the caller can
  // serialize its stream writes deterministically.
  const tasks = active.map(async (s) => {
    try {
      const raw = await withTimeout(
        s.fn(query, pincode),
        PER_SCRAPER_TIMEOUT_MS,
        s.name
      );
      const priced = raw.filter(
        (l) => l.sellingPrice != null || l.mrp != null
      );
      console.log(
        `[scrape] ${s.name}: ${raw.length} raw, ${priced.length} priced`
      );
      aggregated.push(...priced);
      await onPharmacy(s.name, priced);
    } catch (err: any) {
      console.error(
        `[scrape] ${s.name} failed:`,
        err?.message ?? err
      );
      // Still emit an empty result so the client can drop the skeleton.
      await onPharmacy(s.name, []);
    }
  });

  await Promise.all(tasks);
  return aggregated;
}

export async function scrapeAll(
  query: string,
  pincode?: string | null,
  opts: ScrapeAllOpts = {}
): Promise<ScrapedListing[]> {
  // Back-compat: callers that only want the aggregate use this; internally
  // we delegate to the streaming variant with a no-op callback.
  const all = await scrapeAllStream(query, pincode, () => {}, opts);
  all.sort((a, b) => {
    const av = a.sellingPrice ?? a.mrp ?? Infinity;
    const bv = b.sellingPrice ?? b.mrp ?? Infinity;
    return av - bv;
  });
  return all;
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
