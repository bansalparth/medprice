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
  const rough = await prisma.medicine.findMany({
    where: {
      OR: [
        { normalizedName: { contains: q } },
        { brandName: { contains: q } },
        { saltComposition: { contains: q } },
      ],
      // Only show medicines that have at least one in-stock listing
      listings: {
        some: {
          inStock: true,
        },
      },
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
    })
    .slice(0, limit)
    .map(({ score: _s, ...rest }) => rest);

  return NextResponse.json({ results: scored });
}
