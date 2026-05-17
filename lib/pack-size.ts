/**
 * Pack-count parsing shared by the search route's relevance filter and the
 * PriceCard chip. Returns the number of units in a pack (tablets, capsules,
 * etc.) when one can be confidently extracted from product/pack-size strings.
 *
 * Examples that resolve to 15:
 *   - packSize "15 tablets", "15 Tablet(s) in Strip", "Strip of 15"
 *   - productName "Telma 40 Tablet 15's"
 *   - productName "Dolo 650 Strip of 15 Tablets"
 *
 * Examples that return null (intentionally — don't reject these in the filter):
 *   - "Crocin Cold & Flu" (no count)
 *   - "100ml Bottle" (volume, not count)
 *   - "Telma 40 Tablet" alone — the "40" is the strength, not the count.
 *     1mg writes the strength next to the form keyword without a separate
 *     count marker, so we explicitly DO NOT match this bare pattern in the
 *     product-name source. Only the packSize field carries the real count
 *     in those cases.
 */
const UNITS_RE = "(?:tab(?:lets?)?|cap(?:sules?)?|pieces?|sachets?|units?)";

// Patterns that work on a packSize field — these strings are dedicated to
// describing the pack, so a bare "N tablets" is unambiguously a count.
const PACK_SIZE_PATTERNS: RegExp[] = [
  new RegExp(`\\b(\\d{1,3})\\s?'s\\b`, "i"),
  new RegExp(
    `(?:strip|pack|bottle|box|jar|carton)\\s+of\\s+(\\d{1,3})\\b`,
    "i"
  ),
  // "15 tablet(s) in strip" — packSize-only form with a trailing "in <container>"
  new RegExp(`\\b(\\d{1,3})\\s?${UNITS_RE}(?:\\(s\\))?\\s+in\\b`, "i"),
  new RegExp(`\\b(\\d{1,3})\\s?${UNITS_RE}\\b`, "i"),
  new RegExp(`${UNITS_RE}\\s+(\\d{1,3})\\b`, "i"),
];

// Patterns that work on a productName — stricter. We DO NOT use the bare
// "N tablet" pattern here because product names commonly write the strength
// next to the form keyword ("Telma 40 Tablet"). We only trust explicit
// count markers like "10's" or "Strip of 15".
const PRODUCT_NAME_PATTERNS: RegExp[] = [
  new RegExp(`\\b(\\d{1,3})\\s?'s\\b`, "i"),
  new RegExp(
    `(?:strip|pack|bottle|box|jar|carton)\\s+of\\s+(\\d{1,3})\\b`,
    "i"
  ),
  new RegExp(`\\b(\\d{1,3})\\s?${UNITS_RE}(?:\\(s\\))?\\s+in\\b`, "i"),
];

function tryPatterns(src: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = src.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      // Sanity: real packs are 1..500. Reject e.g. "800mg" dosage.
      if (n >= 1 && n <= 500) return n;
    }
  }
  return null;
}

export function extractPackCount(
  productName: string | null | undefined,
  packSize?: string | null
): number | null {
  // Always prefer the dedicated packSize field — it's unambiguous.
  if (packSize) {
    const fromPackSize = tryPatterns(packSize, PACK_SIZE_PATTERNS);
    if (fromPackSize != null) return fromPackSize;
  }
  // Fall back to product-name with stricter patterns.
  if (productName) {
    const fromName = tryPatterns(productName, PRODUCT_NAME_PATTERNS);
    if (fromName != null) return fromName;
  }
  return null;
}
