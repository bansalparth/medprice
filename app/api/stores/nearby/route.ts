import { NextRequest, NextResponse } from "next/server";
import { findNearestStores } from "@/lib/jan-aushadhi/geo";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Aliases for cities whose Nominatim name differs from the PDF/DB name.
// Keys & values are lowercase. When a key appears (as a word or phrase),
// we also try every alias against the DB.
const CITY_ALIASES: Record<string, string[]> = {
  bangalore: ["bengaluru", "bangalore"],
  bengaluru: ["bengaluru", "bangalore"],
  bombay: ["mumbai", "bombay"],
  mumbai: ["mumbai", "bombay"],
  calcutta: ["kolkata", "calcutta"],
  kolkata: ["kolkata", "calcutta"],
  madras: ["chennai", "madras"],
  chennai: ["chennai", "madras"],
  gurgaon: ["gurugram", "gurgaon"],
  gurugram: ["gurugram", "gurgaon"],
  poona: ["pune", "poona"],
  pune: ["pune", "poona"],
};

// Words too generic to use as standalone district matches. Indian Nominatim
// often returns "Bangalore East", "Mumbai Suburban", etc — and the seeded DB
// has a handful of orphan districts literally named "East" / "West" from
// imperfect PDF extraction, so a `contains "East"` query is a footgun.
const STOP_WORDS = new Set([
  "east", "west", "north", "south", "central",
  "urban", "rural", "suburban", "metropolitan",
  "district", "division", "the", "new", "old",
  "greater", "upper", "lower",
]);

interface GeoResult {
  /** Ordered candidates to try (most specific full-phrase first, then words). */
  searchTerms: string[];
  state: string | null;
  /** Best-guess display name for the user's locality. */
  locality: string | null;
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
      { headers: { "User-Agent": "MedPrice/1.0" } }
    );
    if (!res.ok) return { searchTerms: [], state: null, locality: null };
    const data = await res.json();
    const a = data.address ?? {};

    // Full-phrase candidates (most specific first).
    const fullCandidates: string[] = [];
    for (const f of [a.city, a.town, a.village, a.suburb, a.city_district, a.county, a.state_district]) {
      if (typeof f === "string" && f.trim()) fullCandidates.push(f.trim());
    }

    // Significant individual words, excluding stop words; each word expanded
    // through CITY_ALIASES so "Bangalore" also tries "Bengaluru".
    const wordCandidates: string[] = [];
    for (const c of fullCandidates) {
      for (const raw of c.split(/\s+/)) {
        const w = raw.toLowerCase();
        if (w.length < 4) continue;
        if (STOP_WORDS.has(w)) continue;
        const aliases = CITY_ALIASES[w] ?? [w];
        for (const alias of aliases) wordCandidates.push(alias);
      }
    }

    // Dedup preserving order.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const t of [...fullCandidates, ...wordCandidates]) {
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(t);
    }

    const locality =
      (a.city || a.town || a.village || a.suburb || a.county || a.state_district || null) ?? null;

    return { searchTerms: ordered, state: a.state ?? null, locality };
  } catch {
    return { searchTerms: [], state: null, locality: null };
  }
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // 1) Distance-based — only when user is actually close to a known store.
  const stores = await findNearestStores(lat, lng, limit);
  if (stores.length > 0 && stores[0].distanceKm < 50) {
    return NextResponse.json({ stores, locality: null });
  }

  // 2) Reverse geocode → ordered candidates.
  const { searchTerms, state, locality } = await reverseGeocode(lat, lng);

  if (searchTerms.length === 0 && !state) {
    return NextResponse.json({ stores: [], locality });
  }

  // 3) Prefer exact (case-insensitive) district match scoped to state. This
  //    keeps single-word tokens like "Bengaluru" from accidentally matching
  //    a different state's district via `contains`.
  if (state) {
    for (const term of searchTerms) {
      const exact = await prisma.janAushadhiStore.findMany({
        where: {
          district: { equals: term, mode: "insensitive" as const },
          state: { contains: state, mode: "insensitive" as const },
        },
        take: limit,
      });
      if (exact.length > 0) return NextResponse.json({ stores: exact, locality });
    }
  }

  // 4) Fall back to `contains` district match scoped to state.
  for (const term of searchTerms) {
    const results = await prisma.janAushadhiStore.findMany({
      where: {
        district: { contains: term, mode: "insensitive" as const },
        ...(state ? { state: { contains: state, mode: "insensitive" as const } } : {}),
      },
      take: limit,
    });
    if (results.length > 0) return NextResponse.json({ stores: results, locality });
  }

  // 5) Broader: state-only match.
  if (state) {
    const stateStores = await prisma.janAushadhiStore.findMany({
      where: { state: { contains: state, mode: "insensitive" as const } },
      take: limit,
    });
    if (stateStores.length > 0) return NextResponse.json({ stores: stateStores, locality });
  }

  // 6) Last resort: try search terms against the state field (covers "Delhi").
  for (const term of searchTerms) {
    const results = await prisma.janAushadhiStore.findMany({
      where: { state: { contains: term, mode: "insensitive" as const } },
      take: limit,
    });
    if (results.length > 0) return NextResponse.json({ stores: results, locality });
  }

  return NextResponse.json({ stores: [], locality });
}
