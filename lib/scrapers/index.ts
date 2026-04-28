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

// On Vercel, the function has a hard 60s ceiling and ~1GB RAM. Spinning up
// 6 chromium contexts in parallel risks OOM and timeouts. We cap concurrency
// to SERVERLESS_SCRAPE_LIMIT (default 3) and process in waves. Locally we run
// all six at once.
const IS_SERVERLESS =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const SERVERLESS_SCRAPE_LIMIT = parseInt(
  process.env.SERVERLESS_SCRAPE_LIMIT ?? "3",
  10
);

// Hard ceiling per pharmacy — if one site hangs (cloudflare challenge,
// network stall, anti-bot), fail it fast so the rest of the scrape
// completes within the function's 60s wall-clock budget.
const PER_SCRAPER_TIMEOUT_MS = parseInt(
  process.env.PER_SCRAPER_TIMEOUT_MS ?? "18000",
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

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (err) {
        results[i] = { status: "rejected", reason: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scrapeAll(
  query: string,
  pincode?: string | null
): Promise<ScrapedListing[]> {
  // Wrap every scraper in a per-pharmacy timeout. Without this a single
  // hung scraper blocks the wave (parallel) or all subsequent ones (sequential).
  const tasks = SCRAPERS.map(
    (s) => () => withTimeout(s.fn(query, pincode), PER_SCRAPER_TIMEOUT_MS, s.name)
  );
  const results = IS_SERVERLESS
    ? await runWithConcurrency(tasks, SERVERLESS_SCRAPE_LIMIT)
    : await Promise.allSettled(tasks.map((t) => t()));

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
