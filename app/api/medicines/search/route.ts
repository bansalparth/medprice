import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Typeahead endpoint. Returns up to N medicines matching the prefix.
 *
 * Ranking (highest first):
 *   1. WORD-BOUNDARY prefix on brand or name ("dolo " matches "Dolo 650"
 *      but not "Dolosen") — keeps the canonical short form on top.
 *   2. Plain prefix on brand or name.
 *   3. Substring on brand or name.
 *   4. Substring on salt (catalog rows only — avoids stale auto-rows).
 *   5. Popularity tie-breaker from SearchLog frequency.
 *   6. Catalog rows beat non-catalog rows on ties.
 */

// Module-level popularity index. Rebuilt every 10 minutes — cheap, since
// SearchLog is small and the data only matters to break ties.
interface PopularityCache {
  byMedicineId: Map<string, number>;
  expiresAt: number;
}
let popularity: PopularityCache | null = null;
const POPULARITY_TTL_MS = 10 * 60 * 1000;

async function getPopularity(): Promise<Map<string, number>> {
  if (popularity && popularity.expiresAt > Date.now()) {
    return popularity.byMedicineId;
  }
  const rows = await prisma.searchLog
    .groupBy({
      by: ["medicineId"],
      where: { medicineId: { not: null } },
      _count: { medicineId: true },
    })
    .catch(() => [] as Array<{ medicineId: string | null; _count: { medicineId: number } }>);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.medicineId) map.set(r.medicineId, r._count.medicineId);
  }
  popularity = { byMedicineId: map, expiresAt: Date.now() + POPULARITY_TTL_MS };
  return map;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "10"), 25);

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Word-boundary regex: query followed by whitespace, digit, or end-of-string.
  // "dolo" → /^dolo([\s\d]|$)/i — matches "Dolo 650" but NOT "Dolosen".
  const wb = new RegExp(`^${escapeRegex(q)}([\\s\\d]|$)`, "i");

  // FAST PATH: brand/name prefix match using the existing indexes. Most
  // queries hit here and return in <50ms.
  const prefixMatches = await prisma.medicine.findMany({
    where: {
      OR: [
        { brandName: { startsWith: q, mode: "insensitive" } },
        { normalizedName: { startsWith: q, mode: "insensitive" } },
      ],
      AND: [
        {
          OR: [
            { listings: { some: { inStock: true } } },
            { AND: [{ isCatalog: true }, { listings: { none: {} } }] },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      brandName: true,
      manufacturer: true,
      saltComposition: true,
      dosageForm: true,
      packSize: true,
      category: true,
      isCatalog: true,
    },
    take: 40,
  });

  // SLOW PATH fallback only when the prefix path didn't yield enough rows.
  let rough = prefixMatches;
  if (rough.length < limit) {
    const seenIds = new Set(rough.map((m) => m.id));
    const more = await prisma.medicine.findMany({
      where: {
        OR: [
          { normalizedName: { contains: q, mode: "insensitive" } },
          { brandName: { contains: q, mode: "insensitive" } },
          { saltComposition: { contains: q, mode: "insensitive" } },
        ],
        AND: [
          {
            OR: [
              { listings: { some: { inStock: true } } },
              { AND: [{ isCatalog: true }, { listings: { none: {} } }] },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        brandName: true,
        manufacturer: true,
        saltComposition: true,
        dosageForm: true,
        packSize: true,
        category: true,
        isCatalog: true,
      },
      take: 60,
    });
    for (const m of more) {
      if (!seenIds.has(m.id)) rough.push(m);
    }
  }

  const pop = await getPopularity();

  const scored = rough
    .map((m) => {
      const brand = (m.brandName ?? "").toLowerCase();
      const norm = m.name.toLowerCase();
      const salt = (m.saltComposition ?? "").toLowerCase();
      let score = 0;

      // Tier 1: word-boundary prefix — most specific, biggest boost.
      if (wb.test(m.brandName ?? "")) score += 200;
      else if (wb.test(m.name)) score += 180;

      // Tier 2: plain prefix.
      if (brand.startsWith(q)) score += 100;
      else if (norm.startsWith(q)) score += 80;

      // Tier 3: substring.
      if (!brand.startsWith(q) && brand.includes(q)) score += 60;
      if (!norm.startsWith(q) && norm.includes(q)) score += 30;

      // Tier 4: salt match — only matters for catalog entries.
      if (m.isCatalog && salt.includes(q)) score += 10;

      // Catalog boost.
      if (m.isCatalog) score += 40;

      // Popularity tie-breaker.
      score += Math.min(pop.get(m.id) ?? 0, 50);

      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    // Hide non-catalog entries that ONLY matched on salt.
    .filter((m) => {
      if (m.isCatalog) return true;
      const brand = (m.brandName ?? "").toLowerCase();
      const norm = m.name.toLowerCase();
      return brand.includes(q) || norm.includes(q);
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.isCatalog !== b.isCatalog) return a.isCatalog ? -1 : 1;
      return a.name.length - b.name.length;
    });

  // Deduplicate identical-looking entries and collapse strength variants.
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

  const final = deduped
    .slice(0, limit)
    .map(({ score: _s, ...rest }) => rest);

  return NextResponse.json(
    { results: final },
    {
      headers: {
        // Edge-cache identical prefixes for a minute; SWR for 5 more.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
