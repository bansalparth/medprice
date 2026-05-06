import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractSaltTokens,
  parseIngredients,
  ingredientSimilarity,
} from "@/lib/jan-aushadhi/salt";
import { scrapeOne } from "@/lib/scrapers";
import { normalizeMedicineName } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Alternatives API — 3-tier fallback + live pricing from one pharmacy.
 *
 * Query params:
 *   ?pharmacy=1mg  — scrape alternatives on this pharmacy only (cheapest for parent)
 *
 * Match logic (tries in order, stops at first with results):
 *   1. Structured ingredient similarity (Jaccard ≥ 0.66) among catalog entries
 *   2. Exact salt composition match across all medicines
 *   3. CSV substitute brand names (substitute0-4 from 1mg dataset)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { medicineId: string } },
) {
  const pharmacy = req.nextUrl.searchParams.get("pharmacy") ?? null;

  const me = await prisma.medicine.findUnique({
    where: { id: params.medicineId },
    select: {
      id: true,
      name: true,
      brandName: true,
      saltComposition: true,
      ingredients: true,
      substitutes: true,
      isCatalog: true,
    },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Try each strategy in order
  let alternatives = await tryIngredientMatch(me);
  let mode: string = "ingredients";

  if (alternatives.length === 0) {
    alternatives = await trySaltMatch(me);
    mode = "salt-match";
  }

  if (alternatives.length === 0) {
    alternatives = await trySubstituteMatch(me);
    mode = "substitutes";
  }

  if (alternatives.length === 0) {
    return NextResponse.json({
      mode: "none",
      ingredients: parseIngredients(me.ingredients),
      saltComposition: me.saltComposition,
      alternatives: [],
      disclaimer: STANDARD_DISCLAIMER,
    });
  }

  // Live-price each alternative from the cheapest pharmacy (in parallel)
  if (pharmacy) {
    const priced = await priceAlternatives(alternatives, pharmacy);
    alternatives = priced;
  }

  return NextResponse.json({
    mode,
    ingredients: parseIngredients(me.ingredients),
    saltComposition: me.saltComposition,
    pharmacy,
    alternatives: alternatives.slice(0, 6),
    disclaimer: STANDARD_DISCLAIMER,
  });
}

// ── Strategy 1: Ingredient similarity ──────────────────────────────────────

interface AltCandidate {
  id: string;
  name: string;
  brandName: string | null;
  manufacturer: string | null;
  saltComposition: string | null;
  dosageForm: string | null;
  packSize: string | null;
  similarity: number;
  matchType: "ingredient" | "salt" | "substitute";
  cheapestPrice: number | null;
  cheapestPharmacy: string | null;
}

async function tryIngredientMatch(me: {
  id: string;
  ingredients: string | null;
  saltComposition: string | null;
}): Promise<AltCandidate[]> {
  const myIngredients = parseIngredients(me.ingredients);
  if (myIngredients.length === 0) return [];

  const candidates = await prisma.medicine.findMany({
    where: {
      id: { not: me.id },
      isCatalog: true,
      ingredients: { not: null },
    },
    select: {
      id: true,
      name: true,
      brandName: true,
      manufacturer: true,
      saltComposition: true,
      dosageForm: true,
      packSize: true,
      ingredients: true,
    },
  });

  return candidates
    .map((c) => {
      const theirIngredients = parseIngredients(c.ingredients);
      const sim = ingredientSimilarity(myIngredients, theirIngredients);
      return {
        id: c.id,
        name: c.name,
        brandName: c.brandName,
        manufacturer: c.manufacturer,
        saltComposition: c.saltComposition,
        dosageForm: c.dosageForm,
        packSize: c.packSize,
        similarity: sim,
        matchType: "ingredient" as const,
        cheapestPrice: null,
        cheapestPharmacy: null,
      };
    })
    .filter((c) => c.similarity >= 0.66)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);
}

// ── Strategy 2: Salt composition match ─────────────────────────────────────

async function trySaltMatch(me: {
  id: string;
  saltComposition: string | null;
}): Promise<AltCandidate[]> {
  if (!me.saltComposition) return [];

  // Normalize salt for comparison
  const normalizedSalt = me.saltComposition.toLowerCase().trim();
  if (!normalizedSalt || normalizedSalt === "na") return [];

  // Use case-insensitive exact match via Prisma
  const matches = await prisma.medicine.findMany({
    where: {
      id: { not: me.id },
      saltComposition: {
        equals: me.saltComposition!,
        mode: "insensitive",
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
    },
    take: 20,
  });

  const saltMatches = matches
    .map((c) => ({
      id: c.id,
      name: c.name,
      brandName: c.brandName,
      manufacturer: c.manufacturer,
      saltComposition: c.saltComposition,
      dosageForm: c.dosageForm,
      packSize: c.packSize,
      similarity: 1.0,
      matchType: "salt" as const,
      cheapestPrice: null,
      cheapestPharmacy: null,
    }))
    .slice(0, 6);

  return saltMatches;
}

// ── Strategy 3: CSV substitute names ───────────────────────────────────────

async function trySubstituteMatch(me: {
  id: string;
  substitutes: string | null;
}): Promise<AltCandidate[]> {
  if (!me.substitutes) return [];

  let subNames: string[];
  try {
    subNames = JSON.parse(me.substitutes);
  } catch {
    return [];
  }

  if (!Array.isArray(subNames) || subNames.length === 0) return [];

  // Normalize each substitute name and look up in DB
  const results: AltCandidate[] = [];

  for (const subName of subNames.slice(0, 5)) {
    const normalized = normalizeMedicineName(subName);
    if (!normalized) continue;

    const match = await prisma.medicine.findUnique({
      where: { normalizedName: normalized },
      select: {
        id: true,
        name: true,
        brandName: true,
        manufacturer: true,
        saltComposition: true,
        dosageForm: true,
        packSize: true,
      },
    });

    if (match && match.id !== me.id) {
      results.push({
        id: match.id,
        name: match.name,
        brandName: match.brandName,
        manufacturer: match.manufacturer,
        saltComposition: match.saltComposition,
        dosageForm: match.dosageForm,
        packSize: match.packSize,
        similarity: -1, // -1 signals "suggested" (not scored)
        matchType: "substitute",
        cheapestPrice: null,
        cheapestPharmacy: null,
      });
    }
  }

  return results;
}

// ── Live pricing ───────────────────────────────────────────────────────────

const PRICE_TIMEOUT_MS = 8000;

async function priceAlternatives(
  alts: AltCandidate[],
  pharmacy: string,
): Promise<AltCandidate[]> {
  const tasks = alts.map(async (alt) => {
    try {
      const searchTerm = alt.brandName ?? alt.name;
      const listings = await Promise.race([
        scrapeOne(pharmacy, searchTerm),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), PRICE_TIMEOUT_MS),
        ),
      ]);

      // Find the best matching listing by name
      const nameTokens = searchTerm
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 2);

      const match = listings
        .filter((l) => l.inStock && l.sellingPrice != null)
        .find((l) => {
          const pName = l.productName.toLowerCase();
          return nameTokens.every((t) => pName.includes(t));
        });

      // Fallback: just pick the cheapest in-stock result
      const bestMatch =
        match ??
        listings
          .filter((l) => l.inStock && l.sellingPrice != null)
          .sort(
            (a, b) => (a.sellingPrice ?? Infinity) - (b.sellingPrice ?? Infinity),
          )[0] ??
        null;

      return {
        ...alt,
        cheapestPrice: bestMatch?.sellingPrice ?? null,
        cheapestPharmacy: bestMatch ? pharmacy : null,
      };
    } catch {
      return alt; // keep alt with null price on failure
    }
  });

  return Promise.all(tasks);
}

const STANDARD_DISCLAIMER =
  "Alternatives shown share the same active ingredients as listed by the manufacturer. They are NOT medical advice. Always consult a registered medical practitioner before substituting a prescribed medicine — equivalence in active ingredient does not always mean clinical interchangeability.";
