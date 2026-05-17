/**
 * Pack-count parsing shared by the search route's relevance filter and the
 * PriceCard chip. Returns the number of units in a pack (tablets, capsules,
 * etc.) when one can be confidently extracted from product/pack-size strings.
 *
 * Examples that resolve to 15:
 *   - "Telma 40 Tablet 15's"
 *   - "Dolo 650 Strip of 15 Tablets"
 *   - "15 Tablet(s) in Strip"
 *   - "Pack of 15 Tablets"
 *
 * Examples that return null (intentionally — don't reject these in the filter):
 *   - "Crocin Cold & Flu" (no count)
 *   - "100ml Bottle" (volume, not count)
 */
const UNITS_RE = "(?:tab(?:lets?)?|cap(?:sules?)?|pieces?|sachets?|units?)";

const PATTERNS: RegExp[] = [
  // "15's" / "30's"
  new RegExp(`\\b(\\d{1,3})\\s?'s\\b`, "i"),
  // "Strip of 15", "Pack of 30", "Bottle of 15", "Box of 4"
  new RegExp(
    `(?:strip|pack|bottle|box|jar|carton)\\s+of\\s+(\\d{1,3})\\b`,
    "i"
  ),
  // "15 Tablet(s)", "30 Tabs", "10 Caps"
  new RegExp(`\\b(\\d{1,3})\\s?${UNITS_RE}\\b`, "i"),
  // "Tablets 15", "Capsules 10"  (less common ordering)
  new RegExp(`${UNITS_RE}\\s+(\\d{1,3})\\b`, "i"),
];

export function extractPackCount(
  productName: string | null | undefined,
  packSize?: string | null
): number | null {
  for (const src of [productName, packSize]) {
    if (!src) continue;
    for (const re of PATTERNS) {
      const m = src.match(re);
      if (m) {
        const n = parseInt(m[1], 10);
        // Sanity: real packs are 1..500. Reject 800mg dosage etc.
        if (n >= 1 && n <= 500) return n;
      }
    }
  }
  return null;
}
