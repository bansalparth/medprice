import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractSaltTokens,
  parseIngredients,
  ingredientSimilarity,
} from "@/lib/jan-aushadhi/salt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alternatives are restricted to CATALOG entries (curated medicines we trust)
 * with a high ingredient overlap. We don't surface alternatives based on
 * scraped/free-text salt strings — those are unreliable and pose legal risk.
 *
 * Match logic:
 *   1. Read this medicine's structured ingredients (from catalog seed)
 *   2. Find other catalog entries whose ingredient set overlaps ≥ 0.66
 *   3. For ties, sort by lowest cheapest-online-price
 *   4. Return up to 6
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { medicineId: string } }
) {
  const me = await prisma.medicine.findUnique({
    where: { id: params.medicineId },
    select: {
      id: true,
      name: true,
      brandName: true,
      saltComposition: true,
      ingredients: true,
      isCatalog: true,
    },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const myIngredients = parseIngredients(me.ingredients);
  const fallbackTokens = extractSaltTokens(me.saltComposition);

  if (myIngredients.length === 0 && fallbackTokens.length === 0) {
    return NextResponse.json({
      mode: "none",
      ingredients: [],
      saltComposition: me.saltComposition,
      alternatives: [],
      disclaimer: STANDARD_DISCLAIMER,
    });
  }

  // Pull all catalog medicines with structured ingredients
  const candidates = await prisma.medicine.findMany({
    where: {
      id: { not: me.id },
      isCatalog: true,
      ingredients: { not: null },
    },
    include: {
      listings: {
        where: { sellingPrice: { not: null }, inStock: true },
        orderBy: { sellingPrice: "asc" },
        take: 1,
      },
    },
  });

  const scored = candidates
    .map((c) => {
      const theirIngredients = parseIngredients(c.ingredients);
      const sim = ingredientSimilarity(myIngredients, theirIngredients);
      const cheapest = c.listings[0];
      return {
        id: c.id,
        name: c.name,
        brandName: c.brandName,
        manufacturer: c.manufacturer,
        saltComposition: c.saltComposition,
        ingredients: theirIngredients,
        dosageForm: c.dosageForm,
        packSize: c.packSize,
        similarity: sim,
        sharedIngredients: theirIngredients.filter((t) =>
          myIngredients.includes(t)
        ),
        cheapestPharmacy: cheapest?.pharmacyName ?? null,
        cheapestPrice: cheapest?.sellingPrice ?? null,
      };
    })
    // Strict threshold — only surface drugs with very similar ingredient sets
    .filter((c) => c.similarity >= 0.66 && c.sharedIngredients.length > 0)
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      const ap = a.cheapestPrice ?? Infinity;
      const bp = b.cheapestPrice ?? Infinity;
      return ap - bp;
    })
    .slice(0, 6);

  return NextResponse.json({
    mode: myIngredients.length > 0 ? "ingredients" : "salt-fallback",
    ingredients: myIngredients,
    saltComposition: me.saltComposition,
    alternatives: scored,
    disclaimer: STANDARD_DISCLAIMER,
  });
}

const STANDARD_DISCLAIMER =
  "Alternatives shown share the same active ingredients as listed by the manufacturer. They are NOT medical advice. Always consult a registered medical practitioner before substituting a prescribed medicine — equivalence in active ingredient does not always mean clinical interchangeability.";
