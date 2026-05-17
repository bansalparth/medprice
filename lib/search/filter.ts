/**
 * Catalog-relevance filtering for scraped pharmacy listings.
 *
 * Pharmacies return cross-sells, related products, and wrong-strength
 * variants in their search results. Before we display or persist anything
 * we strip these down to listings that actually match the catalog medicine
 * the user picked.
 *
 * All functions in this module are PURE (no DB, no network) so they can be
 * called per-pharmacy in a streaming pipeline as well as on the bulk result
 * set in the legacy code path.
 */

import type { ScrapedListing } from "@/lib/scrapers/types";
import { extractPackCount } from "@/lib/pack-size";

const NOISE_TOKENS = new Set([
  "tablet", "tablets", "capsule", "capsules", "tab", "tabs", "cap", "caps",
  "strip", "strips", "bottle", "pack", "of", "syrup", "drops", "injection",
  "cream", "gel", "ointment", "suspension", "solution", "sachet", "sachets",
  "piece", "pieces", "unit", "units", "box", "jar", "carton", "ml", "mg",
  "mcg", "gm", "g", "iu",
]);

const FORMULATION_SUFFIXES = [
  "md", "odt", "dt", "sr", "er", "xl", "xr", "cr", "pr", "la", "ir", "fc",
  "ec", "chewable",
];

const DOSAGE_FORM_GROUPS: Record<string, string[]> = {
  tablet:      ["tablet", "tablets", "tab", "tabs"],
  capsule:     ["capsule", "capsules", "cap", "caps", "softgel", "softgels"],
  syrup:       ["syrup", "suspension", "oral solution", "liquid", "elixir"],
  injection:   ["injection", "injections", "inj", "vial", "ampoule"],
  drops:       ["drops", "drop"],
  cream:       ["cream"],
  gel:         ["gel"],
  ointment:    ["ointment"],
  inhaler:     ["inhaler", "rotacaps", "respules"],
  spray:       ["spray"],
  powder:      ["powder", "sachet", "granules"],
  patch:       ["patch", "patches"],
  suppository: ["suppository", "suppositories"],
};

const BUNDLE_RE =
  /\b(combo|hamper|combination|with\s+free)\b|\bpack\s+of\s+([2-9]|\d{2,})\b|\bthermometer\b|&\s/i;

function escapeRe(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function tokenRegex(tok: string): RegExp {
  const esc = escapeRe(tok);
  if (/^\d+(\.\d+)?$/.test(tok)) {
    return new RegExp(`\\b${esc}(?:\\s?(?:mg|mcg|ml|gm|g|iu|%))?\\b`, "i");
  }
  return new RegExp(`\\b${esc}\\b`, "i");
}

/**
 * Per-medicine context derived from the catalog row. Build once, reuse for
 * every per-pharmacy filter call so we don't re-parse on each chunk.
 */
export interface FilterContext {
  sourceText: string;
  brandTokens: string[];
  brandSet: Set<string>;
  tokenRegexes: RegExp[];
  primaryStrength: number | null;
  primaryUnit: string | null;
  catalogSuffixes: Set<string>;
  catalogDosageGroup: string | null;
  /** Target pack count: either the user-selected size from ?packSize=, or
   *  the catalog's canonical count, or null when unknown. Used to reject
   *  listings whose extractable pack count is confidently different. */
  targetPackCount: number | null;
}

export function buildFilterContext(
  medRow: {
    brandName?: string | null;
    name?: string | null;
    dosageForm?: string | null;
    ingredients?: string | null;
    packSize?: string | null;
  },
  requestedPack: number | null = null
): FilterContext {
  const sourceText: string = medRow.brandName ?? medRow.name ?? "";

  const brandTokens = sourceText
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 1 &&
        t !== "." &&
        !["tablet", "capsule", "syrup", "drops", "injection", "cream", "gel"].includes(t)
    );

  const tokenRegexes = brandTokens.map(tokenRegex);
  const brandSet = new Set(brandTokens);

  let primaryStrength: number | null = null;
  let primaryUnit: string | null = null;
  if (medRow.ingredients) {
    try {
      const parsed = JSON.parse(medRow.ingredients);
      if (Array.isArray(parsed) && parsed[0]?.strength) {
        primaryStrength = Number(parsed[0].strength);
        primaryUnit = String(parsed[0].unit ?? "").toLowerCase();
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback: if ingredients didn't supply a strength, try to extract one
  // from the full medicine display name. We try medRow.name first because
  // brandName often omits the strength (e.g. brandName="Telma",
  // name="Telma 40 Tablet").
  //
  // extractStrengths() conservatively ignores bare numbers under 50 to
  // avoid treating pack counts as strengths. But many real strengths are
  // 40 / 20 / 10 mg — so we also accept a "<brand> <digit> <form>"
  // pattern as a positive signal (the form keyword distinguishes it from
  // a "10's" count).
  if (primaryStrength == null) {
    const nameSrc = medRow.name ?? sourceText;
    const fromName = extractStrengths(nameSrc);
    if (fromName.length === 1) {
      primaryStrength = fromName[0];
    } else if (fromName.length === 0 && brandTokens.length > 0) {
      const brandPat = brandTokens
        .map((t) => t.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"))
        .join("\\s+");
      const formPat =
        "(?:tablet|tablets|capsule|capsules|tab|cap|syrup|drops|injection|cream|gel|ointment|suspension|powder|sachet|inhaler|spray)";
      const m = nameSrc
        .toLowerCase()
        .match(new RegExp(`\\b${brandPat}\\s+(\\d{1,4}(?:\\.\\d+)?)\\s+${formPat}\\b`, "i"));
      if (m) {
        const n = parseFloat(m[1]);
        if (!isNaN(n) && n >= 1) primaryStrength = n;
      }
    }
  }

  const catalogSuffixes = extractSuffixes(sourceText);
  const catalogDosageGroup: string | null = medRow.dosageForm
    ? detectDosageGroup(medRow.dosageForm) ?? detectDosageGroup(sourceText)
    : detectDosageGroup(sourceText);

  // Pack-count: prefer the user's explicit pick over the catalog's canonical
  // pack size. Either can be null (e.g. liquids), in which case the pack
  // filter is a no-op below.
  const catalogPackCount =
    extractPackCount(medRow.packSize ?? null, sourceText) ?? null;
  const targetPackCount: number | null = requestedPack ?? catalogPackCount;

  return {
    sourceText,
    brandTokens,
    brandSet,
    tokenRegexes,
    primaryStrength,
    primaryUnit,
    catalogSuffixes,
    catalogDosageGroup,
    targetPackCount,
  };
}

function isCountContext(name: string, num: number): boolean {
  if (new RegExp(`\\b${num}\\s?'s\\b`, "i").test(name)) return true;
  if (
    new RegExp(
      `(?:strip|pack|bottle|box|jar|carton)\\s+of\\s+${num}\\b`,
      "i"
    ).test(name)
  )
    return true;
  if (
    num < 50 &&
    new RegExp(
      `\\b${num}\\s?(?:tab(?:lets?)?|cap(?:sules?)?|drops?|sachets?|pieces?|units?)\\b`,
      "i"
    ).test(name)
  )
    return true;
  return false;
}

function extractStrengths(name: string): number[] {
  const lower = name.toLowerCase();
  const out: number[] = [];

  const unitMatches =
    lower.match(/\b(\d+(?:\.\d+)?)\s?(?:mg|mcg|gm|iu|%)\b/g) ?? [];
  for (const m of unitMatches) {
    const n = parseFloat(m);
    if (!isNaN(n)) out.push(n);
  }

  const bareMatches = lower.match(/\b(\d{2,4}(?:\.\d+)?)\b/g) ?? [];
  for (const m of bareMatches) {
    const n = parseFloat(m);
    if (isNaN(n) || n < 50) continue;
    if (out.includes(n)) continue;
    if (new RegExp(`\\b${m}\\s?ml\\b`, "i").test(name)) continue;
    if (isCountContext(name, n)) continue;
    out.push(n);
  }

  return out;
}

function extractSuffixes(name: string): Set<string> {
  const lower = name.toLowerCase();
  const found = new Set<string>();
  for (const sfx of FORMULATION_SUFFIXES) {
    if (new RegExp(`\\b${sfx}\\b`, "i").test(lower)) {
      found.add(sfx);
    }
  }
  return found;
}

const KW_TO_GROUP = new Map<string, string>();
for (const [group, kws] of Object.entries(DOSAGE_FORM_GROUPS)) {
  for (const kw of kws) KW_TO_GROUP.set(kw, group);
}

function detectDosageGroup(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [kw, group] of KW_TO_GROUP) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) return group;
  }
  return null;
}

/**
 * Drop cross-sells, bundles, wrong strengths, wrong formulations, and
 * mismatched dosage forms. Mirrors the rules used by the bulk persist
 * pipeline so the streaming path produces identical visible results.
 */
export function filterRelevantListings(
  listings: ScrapedListing[],
  ctx: FilterContext
): ScrapedListing[] {
  if (ctx.tokenRegexes.length === 0) return listings;

  return listings.filter((s) => {
    // 1. Reject obvious bundles / multi-packs
    if (BUNDLE_RE.test(s.productName)) return false;

    // 2. Brand tokens must all be present
    if (!ctx.tokenRegexes.every((re) => re.test(s.productName))) return false;

    // 3. Strength check
    if (ctx.primaryStrength != null) {
      const prodStrengths = extractStrengths(s.productName);
      if (
        prodStrengths.length > 0 &&
        !prodStrengths.includes(ctx.primaryStrength)
      ) {
        return false;
      }
    }

    // 4. Formulation suffix must match
    const prodSuffixes = extractSuffixes(s.productName);
    if (ctx.catalogSuffixes.size === 0 && prodSuffixes.size > 0) return false;
    for (const sfx of ctx.catalogSuffixes) {
      if (!prodSuffixes.has(sfx)) return false;
    }

    // 5. Dosage form must match
    if (ctx.catalogDosageGroup) {
      const prodGroup = detectDosageGroup(s.productName);
      if (prodGroup && prodGroup !== ctx.catalogDosageGroup) return false;
    }

    // 6. Short-brand position check
    if (ctx.brandTokens.length <= 2) {
      const prodWords = s.productName
        .toLowerCase()
        .replace(/[^a-z0-9.\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      const firstBrandIdx = prodWords.findIndex((w) =>
        ctx.brandTokens.some((bt) => w === bt || w.startsWith(bt))
      );
      if (ctx.brandTokens.length === 1 && firstBrandIdx >= 3) return false;

      const extraWords = prodWords.filter(
        (w) =>
          !ctx.brandSet.has(w) &&
          !NOISE_TOKENS.has(w) &&
          !/^\d+(\.\d+)?$/.test(w)
      );
      if (extraWords.length > 4) return false;

      // 6b. Salt-variant suffix rejection. For 1-token catalog brands, the
      // word immediately after the matched brand often distinguishes a
      // different drug — "Telma D" (telmisartan + diuretic) vs plain Telma.
      // If that word is alpha-only, not a known formulation suffix
      // (SR/MD/ER/etc.), and not a noise word, reject. Numbers are fine
      // (they're strengths or pack counts, handled elsewhere).
      if (ctx.brandTokens.length === 1 && firstBrandIdx >= 0) {
        const nextWord = prodWords[firstBrandIdx + 1];
        if (
          nextWord &&
          /^[a-z]+$/.test(nextWord) &&
          !NOISE_TOKENS.has(nextWord) &&
          !FORMULATION_SUFFIXES.includes(nextWord) &&
          !ctx.brandSet.has(nextWord)
        ) {
          return false;
        }
      }
    }

    // 7. Pack-count match. Reject ONLY when both the catalog target and the
    // listing have a confidently parseable pack count and they differ. If
    // either side is unknown, keep the listing (better to show with a count
    // chip than hide it).
    if (ctx.targetPackCount != null) {
      const prodPack = extractPackCount(s.productName, s.packSize);
      if (prodPack != null && prodPack !== ctx.targetPackCount) return false;
    }

    return true;
  });
}

function scoreListing(
  productName: string,
  ctx: FilterContext
): number {
  const sourceLower = ctx.sourceText.toLowerCase();
  const name = productName.toLowerCase();
  let s = name.includes(sourceLower) ? 100 : 0;
  const tokens = productName
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const t of tokens) {
    if (ctx.brandSet.has(t)) s += 5;
    else if (!NOISE_TOKENS.has(t) && !/^\d+(\.\d+)?$/.test(t)) {
      s -= 2;
    }
  }
  s -= productName.length * 0.01;
  return s;
}

/**
 * Per-pharmacy dedup: pick the single best listing for each pharmacy.
 * Tie-breaks favour in-stock then lowest price.
 */
export function pickBestPerPharmacy(
  listings: ScrapedListing[],
  ctx: FilterContext
): ScrapedListing[] {
  const best = new Map<string, ScrapedListing>();
  const bestScore = new Map<string, number>();
  for (const l of listings) {
    const sc = scoreListing(l.productName, ctx);
    const cur = bestScore.get(l.pharmacyName);
    if (cur === undefined || sc > cur) {
      best.set(l.pharmacyName, l);
      bestScore.set(l.pharmacyName, sc);
    } else if (sc === cur) {
      const curListing = best.get(l.pharmacyName)!;
      const curPrice = curListing.sellingPrice ?? curListing.mrp ?? Infinity;
      const newPrice = l.sellingPrice ?? l.mrp ?? Infinity;
      if (l.inStock && !curListing.inStock) {
        best.set(l.pharmacyName, l);
      } else if (l.inStock === curListing.inStock && newPrice < curPrice) {
        best.set(l.pharmacyName, l);
      }
    }
  }
  return Array.from(best.values());
}
