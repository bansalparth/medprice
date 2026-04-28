/**
 * Delivery ETA estimation per pharmacy.
 *
 * The pharmacies don't expose a public stock-by-pincode API, and scraping
 * each product's delivery widget per query would be slow and brittle.
 * Instead we use a deterministic estimate based on metro / non-metro classification
 * of the user's pincode plus each pharmacy's typical delivery footprint.
 *
 * This gives the user a realistic "Delivers by ..." line on every card, mirroring
 * how 1mg / Apollo / PharmEasy display ETAs.
 */

const METRO_PINCODE_PREFIXES = new Set([
  // Bengaluru
  "560",
  // Mumbai
  "400",
  // Delhi NCR
  "110",
  "201",
  "121",
  "122",
  // Hyderabad
  "500",
  // Chennai
  "600",
  // Kolkata
  "700",
  // Pune
  "411",
  // Ahmedabad
  "380",
  // Jaipur
  "302",
  // Chandigarh
  "160",
]);

const TIER2_PINCODE_PREFIXES = new Set([
  "562", "401", "411", "452", "302", "248", "226", "682", "641",
  "751", "144", "342", "324", "395", "636", "560", "313", "440",
]);

export type DeliveryClass = "metro" | "tier2" | "rest";

export function classifyPincode(pincode: string | null | undefined): DeliveryClass {
  if (!pincode || pincode.length < 3) return "rest";
  const prefix = pincode.slice(0, 3);
  if (METRO_PINCODE_PREFIXES.has(prefix)) return "metro";
  if (TIER2_PINCODE_PREFIXES.has(prefix)) return "tier2";
  return "rest";
}

interface DeliveryProfile {
  metro: { eta: string; serviceable: boolean };
  tier2: { eta: string; serviceable: boolean };
  rest: { eta: string; serviceable: boolean };
}

const PROFILES: Record<string, DeliveryProfile> = {
  "1mg": {
    metro: { eta: "Tomorrow", serviceable: true },
    tier2: { eta: "2-3 days", serviceable: true },
    rest: { eta: "4-6 days", serviceable: true },
  },
  pharmeasy: {
    metro: { eta: "Tomorrow", serviceable: true },
    tier2: { eta: "2-4 days", serviceable: true },
    rest: { eta: "5-7 days", serviceable: true },
  },
  netmeds: {
    metro: { eta: "1-2 days", serviceable: true },
    tier2: { eta: "3-4 days", serviceable: true },
    rest: { eta: "5-7 days", serviceable: true },
  },
  apollo: {
    metro: { eta: "Today / Tomorrow", serviceable: true },
    tier2: { eta: "2-3 days", serviceable: true },
    rest: { eta: "4-6 days", serviceable: true },
  },
  truemeds: {
    metro: { eta: "2-3 days", serviceable: true },
    tier2: { eta: "3-5 days", serviceable: true },
    rest: { eta: "5-8 days", serviceable: true },
  },
  mrmed: {
    metro: { eta: "2-4 days", serviceable: true },
    tier2: { eta: "3-5 days", serviceable: true },
    rest: { eta: "5-8 days", serviceable: true },
  },
};

export interface DeliveryInfo {
  eta: string;
  serviceable: boolean;
}

export function estimateDelivery(
  pharmacy: string,
  pincode: string | null | undefined
): DeliveryInfo {
  const profile = PROFILES[pharmacy];
  if (!profile) return { eta: "3-5 days", serviceable: true };
  const cls = classifyPincode(pincode);
  return profile[cls];
}
