import { prisma } from "@/lib/prisma";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(tab|tablet|cap|capsule|syrup|inj|injection|mg|ml|gm|g|mcg)\b/g, " ")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string): number {
  const wa = new Set(normalize(a).split(" ").filter(Boolean));
  const wb = new Set(normalize(b).split(" ").filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  const inter = new Set([...wa].filter((w) => wb.has(w)));
  const union = new Set([...wa, ...wb]);
  return inter.size / union.size;
}

export async function findJanAushadhiMatch(saltOrName: string) {
  const products = await prisma.janAushadhiProduct.findMany();
  if (products.length === 0) return null;

  let bestMatch: (typeof products)[number] | null = null;
  let bestScore = 0;

  for (const product of products) {
    const target = product.saltComposition || product.genericName;
    const score = jaccard(saltOrName, target);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = product;
    }
  }

  if (!bestMatch || bestScore < 0.4) return null;

  return {
    product: bestMatch,
    confidence: (bestScore > 0.8 ? "exact" : "fuzzy") as "exact" | "fuzzy",
    score: bestScore,
  };
}
