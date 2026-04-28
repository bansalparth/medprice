/**
 * Extract clean salt tokens from a salt composition string.
 * Examples:
 *   "Paracetamol (650mg) + Caffeine (60mg)" -> ["paracetamol", "caffeine"]
 *   "Metformin Hydrochloride 500mg" -> ["metformin"]
 */
const NOISE = new Set([
  "tablet", "tablets", "capsule", "capsules", "syrup", "drop", "drops",
  "injection", "inj", "tab", "cap", "syp", "mg", "mcg", "ml", "gm", "g",
  "iu", "the", "and", "with", "of", "for", "in", "by", "ip", "bp", "usp",
  "hydrochloride", "hcl", "calcium", "sodium", "potassium", "magnesium",
  "sulphate", "sulfate", "phosphate", "citrate", "maleate", "tartrate",
  "fumarate", "succinate", "besilate", "mesylate", "acetate", "diethylamine",
]);

export function extractSaltTokens(s: string | null | undefined): string[] {
  if (!s) return [];
  const cleaned = s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9+\s]/g, " ")
    .replace(/\s+/g, " ");

  const parts = cleaned.split("+").flatMap((p) => p.trim().split(" "));
  const tokens = parts
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !/^\d/.test(t) && !NOISE.has(t));

  return Array.from(new Set(tokens));
}

/**
 * Strip common salt-form suffixes so different salt versions of the same
 * active compound match. e.g.:
 *   "Promethazine Theoclate" -> "promethazine"
 *   "Diclofenac Sodium"      -> "diclofenac"
 *   "Atorvastatin Calcium"   -> "atorvastatin"
 *   "Levothyroxine Sodium"   -> "levothyroxine"
 */
const SALT_SUFFIX_WORDS = [
  "hydrochloride", "hcl",
  "calcium", "sodium", "potassium", "magnesium",
  "sulphate", "sulfate", "phosphate", "citrate",
  "maleate", "tartrate", "fumarate", "succinate",
  "besilate", "mesylate", "acetate", "diethylamine",
  "theoclate", "carbonate", "stearate", "gluconate",
  "lactate", "bicarbonate", "nitrate", "oxide",
  "trihydrate", "monohydrate", "dihydrate",
];

export function canonicalIngredient(name: string): string {
  let n = name.toLowerCase().trim().replace(/\s+/g, " ");
  // Drop trailing salt-form word(s)
  const parts = n.split(" ");
  while (parts.length > 1 && SALT_SUFFIX_WORDS.includes(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts.join(" ").trim();
}

/**
 * Read structured ingredients from the medicine.ingredients JSON column.
 * Returns canonical lowercase ingredient names (salt suffixes stripped),
 * sorted alphabetically.
 */
export function parseIngredients(jsonStr: string | null | undefined): string[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((i: any) => canonicalIngredient((i?.name ?? "").toString()))
      .filter((n: string) => n.length > 0)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Compute a similarity score between two ingredient lists.
 * Returns 0..1 where 1.0 = identical sets.
 */
export function ingredientSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return inter / union;
}
