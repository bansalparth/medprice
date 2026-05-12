import { NextRequest, NextResponse } from "next/server";
import { findNearestStores } from "@/lib/jan-aushadhi/geo";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface GeoResult {
  searchTerms: string[];
  state: string | null;
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
      { headers: { "User-Agent": "MedPrice/1.0" } }
    );
    if (!res.ok) return { searchTerms: [], state: null };
    const data = await res.json();
    const a = data.address ?? {};

    // Collect all useful location names, ordered by specificity
    const candidates: string[] = [];
    if (a.city) candidates.push(a.city);
    if (a.town) candidates.push(a.town);
    if (a.county) candidates.push(a.county);
    if (a.state_district) candidates.push(a.state_district);
    if (a.city_district) candidates.push(a.city_district);

    // Deduplicate and also add individual words for multi-word names
    const terms = new Set<string>();
    for (const c of candidates) {
      terms.add(c);
      const words = c.split(/\s+/).filter((w: string) => w.length > 3);
      for (const w of words) terms.add(w);
    }

    return {
      searchTerms: Array.from(terms),
      state: a.state ?? null,
    };
  } catch {
    return { searchTerms: [], state: null };
  }
}

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get("lat") ?? "");
  const lng = parseFloat(req.nextUrl.searchParams.get("lng") ?? "");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // Try distance-based first (stores with coordinates)
  const stores = await findNearestStores(lat, lng, limit);

  if (stores.length > 0 && stores[0].distanceKm < 50) {
    return NextResponse.json({ stores });
  }

  // Fallback: reverse-geocode to get city/district/state, then match
  const { searchTerms, state } = await reverseGeocode(lat, lng);

  if (searchTerms.length === 0 && !state) {
    return NextResponse.json({ stores: [] });
  }

  // Try each search term against district, scoped to state when available
  for (const term of searchTerms) {
    const results = await prisma.janAushadhiStore.findMany({
      where: {
        district: { contains: term, mode: "insensitive" as const },
        ...(state ? { state: { contains: state, mode: "insensitive" as const } } : {}),
      },
      take: limit,
    });
    if (results.length > 0) {
      return NextResponse.json({ stores: results });
    }
  }

  // Broader: try state-only match if no district match found
  if (state) {
    const stateStores = await prisma.janAushadhiStore.findMany({
      where: { state: { contains: state, mode: "insensitive" as const } },
      take: limit,
    });
    if (stateStores.length > 0) {
      return NextResponse.json({ stores: stateStores });
    }
  }

  // Last resort: try search terms against state (handles "Delhi" case)
  for (const term of searchTerms) {
    const results = await prisma.janAushadhiStore.findMany({
      where: { state: { contains: term, mode: "insensitive" as const } },
      take: limit,
    });
    if (results.length > 0) {
      return NextResponse.json({ stores: results });
    }
  }

  return NextResponse.json({ stores: [] });
}
