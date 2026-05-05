import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Typeahead endpoint. Returns up to N medicines matching the prefix.
 * Ranking: brand-name prefix > brand contains > name contains > salt contains.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "10"), 25);

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Pull a bigger window of candidates, then rank in JS (SQLite has no FTS-default).
  //
  // Show a medicine if either:
  //   1. It has at least one in-stock listing, OR
  //   2. It's a catalog entry that hasn't been scraped yet (no listings).
  //
  // Hide a medicine only when it has listings AND every one of them is OOS
  // (the discontinued / not-for-sale case). This way the 7,400+ catalog
  // medicines awaiting their first scrape stay searchable.
  const rough = await prisma.medicine.findMany({
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
    take: 100,
  });

  const scored = rough
    .map((m) => {
      const brand = (m.brandName ?? "").toLowerCase();
      const norm = m.name.toLowerCase();
      const salt = (m.saltComposition ?? "").toLowerCase();
      let score = 0;
      // Strong: brand starts with query
      if (brand.startsWith(q)) score += 100;
      else if (brand.includes(q)) score += 60;
      // Name match
      if (norm.startsWith(q)) score += 50;
      else if (norm.includes(q)) score += 30;
      // Salt match (weakest — separate "by salt" results)
      if (salt.includes(q)) score += 10;
      // Strong boost for catalog entries (curated, trustworthy data)
      if (m.isCatalog) score += 40;
      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    // Hide non-catalog entries that ONLY matched on salt — they're often
    // stale auto-created rows whose salt was misattributed by old scrapes.
    .filter((m) => {
      if (m.isCatalog) return true;
      const brand = (m.brandName ?? "").toLowerCase();
      const norm = m.name.toLowerCase();
      return brand.includes(q) || norm.includes(q);
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Catalog wins ties
      if (a.isCatalog !== b.isCatalog) return a.isCatalog ? -1 : 1;
      return a.name.length - b.name.length;
    });

  // Deduplicate results that appear identical in the UI.
  // Key = lowercase display text (brandName ?? name). When two results
  // produce the same display, the first one (higher score) wins.
  // Also collapse strength variants (e.g. "crocin advance" vs
  // "crocin advance 500mg tablet") but NOT different drugs
  // (e.g. "aztor" and "aztor asp" stay separate).
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

  return NextResponse.json({ results: final });
}
