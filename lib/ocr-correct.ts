import { prisma } from "@/lib/prisma";
import { normalizeMedicineName } from "@/lib/utils";

// Above this trigram similarity score we trust the catalog match enough to
// substitute the OCR output. Empirically: "belledonna" → "belladonna" scores
// ~0.7, while unrelated noise stays well under 0.4.
const SIMILARITY_THRESHOLD = 0.5;

interface CatalogMatch {
  name: string;
  brandName: string | null;
  sim: number;
}

/**
 * Best-effort typo correction for one OCR-extracted medicine name. Uses the
 * pg_trgm GIN index on Medicine.searchText (already in place for autocomplete)
 * to find the closest catalog entry. Returns the catalog brand/name if the
 * similarity clears the threshold; otherwise returns the raw input unchanged.
 *
 * Falls back silently on any DB error — OCR should never fail because of this.
 */
export async function correctMedicineName(raw: string): Promise<string> {
  const q = normalizeMedicineName(raw);
  if (q.length < 3) return raw;

  try {
    const rows = await prisma.$queryRaw<CatalogMatch[]>`
      SELECT "name", "brandName",
             similarity("searchText", ${q}) AS sim
      FROM   "Medicine"
      WHERE  "searchText" % ${q}
      ORDER  BY sim DESC
      LIMIT  1
    `;
    const top = rows[0];
    if (top && top.sim >= SIMILARITY_THRESHOLD) {
      // Prefer the cleaner brand name when present (e.g. "Belladonna" over
      // "Belladonna 30 CH Dilution"); fall back to the full display name.
      return top.brandName ?? top.name;
    }
  } catch (err) {
    console.warn("[ocr-correct]", (err as Error).message);
  }
  return raw;
}

export async function correctMedicineNames(raws: string[]): Promise<string[]> {
  return Promise.all(raws.map((r) => correctMedicineName(r)));
}
