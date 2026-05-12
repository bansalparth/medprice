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
    // PharmEasy's pincode-aware widget routinely pushes most SKUs to T+2 in
    // metros (cutoffs, warehouse handoff). "Tomorrow" was consistently a day
    // earlier than what pharmeasy.in actually showed.
    metro: { eta: "2 days", serviceable: true },
    tier2: { eta: "3-5 days", serviceable: true },
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Convert a static ETA string ("Tomorrow", "2-3 days", etc.) into a
 * human-readable date label anchored to today's date.
 *
 * Examples (today = Mon 5 May):
 *   "Tomorrow"   → "Tue, May 6"
 *   "2-3 days"   → "Wed–Thu, May 7–8"
 *   "4-6 days"   → "Fri–Sun, May 9–11"
 */
export function etaToDateLabel(eta: string): string {
  // Anchor every date calculation to IST regardless of the server's TZ
  // (Vercel functions run in UTC; requests near midnight IST otherwise
  // produce off-by-one dates).
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );

  const addDays = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  const fmt = (d: Date) =>
    `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

  // "Today / Tomorrow" → show both options
  if (/today.*tomorrow/i.test(eta)) {
    const tom = addDays(1);
    return `Today or ${DAY_NAMES[tom.getDay()]}, ${MONTH_NAMES[tom.getMonth()]} ${tom.getDate()}`;
  }

  // "Tomorrow" → next day
  if (/^tomorrow$/i.test(eta.trim())) {
    return fmt(addDays(1));
  }

  // "1-2 days", "2-3 days", "4-6 days", "5-7 days", etc.
  const rangeMatch = eta.match(/^(\d+)\s*[-–]\s*(\d+)\s*days?$/i);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1]);
    const hi = parseInt(rangeMatch[2]);
    const dLo = addDays(lo);
    const dHi = addDays(hi);
    if (lo === hi - 1 || lo === hi) {
      return `${fmt(dLo)}–${DAY_NAMES[dHi.getDay()]} ${dHi.getDate()}`;
    }
    return `${DAY_NAMES[dLo.getDay()]}–${DAY_NAMES[dHi.getDay()]}, ${MONTH_NAMES[dLo.getMonth()]} ${dLo.getDate()}–${dHi.getDate()}`;
  }

  // Single "3 days" or "5 days"
  const singleMatch = eta.match(/^(\d+)\s*days?$/i);
  if (singleMatch) {
    return fmt(addDays(parseInt(singleMatch[1])));
  }

  // Fallback: return raw string
  return eta;
}

