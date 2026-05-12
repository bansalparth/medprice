import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface CachedRegions {
  states: string[];
  districtsByState: Record<string, string[]>;
  expiresAt: number;
}

// Module-level cache. The JanAushadhiStore table is seeded once and rarely
// changes, so a one-hour TTL is plenty and saves us a `DISTINCT` scan per
// request.
let cache: CachedRegions | null = null;
const TTL_MS = 60 * 60 * 1000;

async function build(): Promise<CachedRegions> {
  // One query: every distinct (state, district) pair in the table.
  const rows = await prisma.janAushadhiStore.findMany({
    select: { state: true, district: true },
    where: { state: { not: null } },
    distinct: ["state", "district"],
  });

  // Aggregate, trim, dedup case-insensitively, sort alphabetically.
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const state = (r.state ?? "").trim();
    if (!state) continue;
    const district = (r.district ?? "").trim();
    if (!map.has(state)) map.set(state, new Set());
    if (district) map.get(state)!.add(district);
  }

  const states = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  const districtsByState: Record<string, string[]> = {};
  for (const s of states) {
    districtsByState[s] = Array.from(map.get(s)!).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  return {
    states,
    districtsByState,
    expiresAt: Date.now() + TTL_MS,
  };
}

export async function GET() {
  if (!cache || cache.expiresAt < Date.now()) {
    cache = await build();
  }
  return NextResponse.json(
    { states: cache.states, districtsByState: cache.districtsByState },
    {
      headers: {
        // Browser + edge cache for an hour; data is effectively static.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    }
  );
}
