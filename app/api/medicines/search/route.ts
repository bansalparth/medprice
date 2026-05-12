import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
// NOTE: deliberately NOT `force-dynamic` — this route is a pure function of
// (?q, ?limit) and we want Vercel's edge to cache repeat prefixes. The
// `Cache-Control` header below does the rest.
export const revalidate = 60;

/**
 * Typeahead endpoint. Sub-500ms p95 against 200k+ medicines.
 *
 * Architecture:
 *   1. Single indexed SQL query against `Medicine.searchText` (denormalized
 *      "brand + name + salt" blob) using:
 *        - prefix btree (text_pattern_ops) for `LIKE 'q%'`
 *        - GIN trigram for `LIKE '%q%'`
 *        - `hasInStock` precomputed flag instead of a correlated subquery.
 *   2. In-process LRU (500 entries × 5min) so repeat keystrokes never hit DB.
 *   3. Stale-while-revalidate popularity cache (never blocks).
 *   4. Vercel edge cache via Cache-Control: public, s-maxage=300, SWR=86400.
 *
 * Ranking (highest first):
 *   1. Word-boundary prefix on the search blob ("dolo " matches "Dolo 650"
 *      but not "Dolosen").
 *   2. Plain prefix.
 *   3. Substring.
 *   4. Catalog rows get +40.
 *   5. Popularity tie-breaker from SearchLog frequency.
 */

// --- Popularity (SWR, never blocks the hot path) -----------------------------

interface PopularityCache {
  byMedicineId: Map<string, number>;
  expiresAt: number;
}
let popularity: PopularityCache | null = null;
let popularityLoading: Promise<void> | null = null;
const POPULARITY_TTL_MS = 10 * 60 * 1000;

async function loadPopularity(): Promise<Map<string, number>> {
  const rows = await prisma.searchLog
    .groupBy({
      by: ["medicineId"],
      where: { medicineId: { not: null } },
      _count: { medicineId: true },
    })
    .catch(
      () =>
        [] as Array<{
          medicineId: string | null;
          _count: { medicineId: number };
        }>
    );
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.medicineId) map.set(r.medicineId, r._count.medicineId);
  }
  return map;
}

async function getPopularity(): Promise<Map<string, number>> {
  if (!popularity) {
    // First call ever — must block once.
    const map = await loadPopularity();
    popularity = { byMedicineId: map, expiresAt: Date.now() + POPULARITY_TTL_MS };
    return map;
  }
  if (popularity.expiresAt < Date.now() && !popularityLoading) {
    // Stale — refresh in background, return current value immediately.
    popularityLoading = (async () => {
      try {
        const map = await loadPopularity();
        popularity = { byMedicineId: map, expiresAt: Date.now() + POPULARITY_TTL_MS };
      } finally {
        popularityLoading = null;
      }
    })();
  }
  return popularity.byMedicineId;
}

// --- In-process LRU ----------------------------------------------------------

interface CacheEntry {
  payload: unknown;
  expiresAt: number;
}
const LRU = new Map<string, CacheEntry>();
const LRU_MAX = 500;
const LRU_TTL_MS = 5 * 60 * 1000;

function lruGet(key: string): unknown | null {
  const e = LRU.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    LRU.delete(key);
    return null;
  }
  // touch (move to most-recent)
  LRU.delete(key);
  LRU.set(key, e);
  return e.payload;
}

function lruSet(key: string, payload: unknown): void {
  if (LRU.size >= LRU_MAX) {
    const oldest = LRU.keys().next().value;
    if (oldest !== undefined) LRU.delete(oldest);
  }
  LRU.set(key, { payload, expiresAt: Date.now() + LRU_TTL_MS });
}

// --- Query -------------------------------------------------------------------

interface RawRow {
  id: string;
  name: string;
  brandName: string | null;
  manufacturer: string | null;
  saltComposition: string | null;
  dosageForm: string | null;
  packSize: string | null;
  category: string | null;
  isCatalog: boolean;
  score: number;
}

async function rankedSearch(q: string): Promise<RawRow[]> {
  // q is already lowercased + trimmed by the caller. We pass it three times
  // via Prisma's safe param binding (no string concat into the SQL body).
  // The word-boundary regex uses POSIX character classes; Postgres needs
  // `\s` written as `[[:space:]]` and `\d` as `[[:digit:]]`.
  const wb = `(^|[[:space:]])${escapePosix(q)}([[:space:][:digit:]]|$)`;
  const prefix = `${q}%`;
  const sub = `%${q}%`;

  return prisma.$queryRaw<RawRow[]>`
    SELECT id, name, "brandName", manufacturer, "saltComposition",
           "dosageForm", "packSize", category, "isCatalog",
           (CASE
              WHEN "searchText" ~ ${wb}          THEN 200
              WHEN "searchText" LIKE ${prefix}   THEN 100
              WHEN "searchText" LIKE ${sub}      THEN 60
              ELSE 0
            END
            + CASE WHEN "isCatalog" THEN 40 ELSE 0 END
           )::int AS score
    FROM   "Medicine"
    WHERE  "hasInStock" = true
      AND  "searchText" LIKE ${sub}
    ORDER  BY score DESC, length("name") ASC
    LIMIT  40
  `;
}

function escapePosix(s: string): string {
  // Escape regex meta for the POSIX `~` operator. Trigram index isn't used
  // for the regex path — only for the LIKE filter — so cost is irrelevant.
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Handler -----------------------------------------------------------------

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "10"),
    25
  );

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const cacheKey = `${q}::${limit}`;
  const cached = lruGet(cacheKey);
  if (cached) {
    return NextResponse.json(
      { results: cached },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=86400, max-age=60",
          "X-Cache": "lru",
        },
      }
    );
  }

  let rough: RawRow[];
  try {
    rough = await rankedSearch(q);
  } catch (err) {
    console.error("[autocomplete] query failed:", err);
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const pop = await getPopularity();

  const scored = rough
    .map((m) => ({
      ...m,
      score: m.score + Math.min(pop.get(m.id) ?? 0, 50),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.isCatalog !== b.isCatalog) return a.isCatalog ? -1 : 1;
      return a.name.length - b.name.length;
    });

  // Collapse strength variants ("Dolo" + "Dolo 650" + "Dolo 1000" → "Dolo")
  // and exact-duplicate display strings.
  const seen: string[] = [];
  const isStrengthVariant = (shorter: string, longer: string) => {
    const rest = longer.slice(shorter.length).trim();
    return /^\d/.test(rest);
  };
  const deduped = scored.filter((m) => {
    const display = (m.brandName ?? m.name).toLowerCase().trim();
    if (seen.includes(display)) return false;
    for (const s of seen) {
      if (display.startsWith(s) && isStrengthVariant(s, display)) return false;
      if (s.startsWith(display) && isStrengthVariant(display, s)) return false;
    }
    seen.push(display);
    return true;
  });

  const final = deduped.slice(0, limit).map(({ score: _s, ...rest }) => rest);

  lruSet(cacheKey, final);

  return NextResponse.json(
    { results: final },
    {
      headers: {
        // Edge-cache identical prefixes for 5 minutes, serve stale for a day
        // while revalidating. max-age=60 lets the browser short-circuit
        // repeat keystrokes within a minute.
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=86400, max-age=60",
        "X-Cache": "miss",
      },
    }
  );
}

// Quiet unused-import lint for Prisma namespace (kept for potential future
// raw-query helpers).
void Prisma;
