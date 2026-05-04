// @ts-nocheck
/**
 * Serviceability test script
 * Run with: npx tsx scripts/test-serviceability.ts
 *
 * Tests per-product serviceability checks + 1mg location pricing across
 * multiple pincodes and pharmacies.
 */

import { check as checkPharmeasy } from "../lib/scrapers/serviceability/pharmeasy";
import { check as checkNetmeds } from "../lib/scrapers/serviceability/netmeds";
import { check as checkTruemeds } from "../lib/scrapers/serviceability/truemeds";
import { checkAll } from "../lib/scrapers/serviceability/index";
import { etaToDateLabel } from "../lib/delivery";
import type { ScrapedListing } from "../lib/scrapers/types";

// Test cases: representative products per pharmacy
const PHARMEASY_DOLO = "https://pharmeasy.in/online-medicine-order/dolo-650mg-strip-of-15-tablets-44140";
const NETMEDS_DOLO = "https://www.netmeds.com/product/dolo-650-tablet-15s-lui1wb-8231049";
const TRUEMEDS_DOLO = "https://www.truemeds.in/otc/dolo-650-mg-tablet-15-tm-tacr1-011691";

const TEST_PINCODES = [
  { code: "400001", label: "Mumbai (metro)" },
  { code: "110001", label: "Delhi (metro)" },
  { code: "302001", label: "Jaipur (tier2)" },
  { code: "600001", label: "Chennai (metro)" },
  { code: "737101", label: "Gangtok (rest)" },
];

async function run() {
  console.log("=== Serviceability Tests ===\n");

  // 1. Test etaToDateLabel
  console.log("--- etaToDateLabel ---");
  for (const eta of ["Tomorrow", "2-3 days", "4-6 days", "Today / Tomorrow", "1-2 days"]) {
    console.log(`  ${eta.padEnd(20)} → ${etaToDateLabel(eta)}`);
  }

  // 2. PharmEasy check (national stock, no pincode variance expected)
  console.log("\n--- PharmEasy Dolo 650 ---");
  for (const { code, label } of TEST_PINCODES) {
    try {
      const result = await checkPharmeasy(PHARMEASY_DOLO, code);
      console.log(`  ${label}: inStock=${result?.inStock} price=${result?.price} source=${result?.source}`);
    } catch (e) {
      console.log(`  ${label}: ERROR - ${(e as Error).message}`);
    }
  }

  // 3. Netmeds check
  console.log("\n--- Netmeds Dolo 650 ---");
  try {
    const result = await checkNetmeds(NETMEDS_DOLO, "400001");
    console.log(`  Mumbai: inStock=${result?.inStock} price=${result?.price} mrp=${result?.mrp}`);
  } catch (e) {
    console.log(`  Mumbai: ERROR - ${(e as Error).message}`);
  }

  // 4. TrueMeds check across pincodes
  console.log("\n--- TrueMeds Dolo 650 ---");
  for (const { code, label } of TEST_PINCODES.slice(0, 4)) {
    try {
      const result = await checkTruemeds(TRUEMEDS_DOLO, code);
      console.log(`  ${label}: inStock=${result?.inStock} price=${result?.price}`);
    } catch (e) {
      console.log(`  ${label}: ERROR - ${(e as Error).message}`);
    }
  }

  // 5. 1mg pricing comparison (via search API) — Delhi vs Mumbai
  console.log("\n--- 1mg Delhi vs Mumbai price (search API) ---");
  const { fetchJson } = await import("../lib/scrapers/http");
  for (const { city, pincode } of [{ city: "Delhi", pincode: "110001" }, { city: "Mumbai", pincode: "400001" }]) {
    const url = `https://www.1mg.com/pwa-api/api/v4/search/all?q=dolo+650&city=${city}&types=sku&page=1&per_page=3`;
    const data = await fetchJson(url, {
      headers: { referer: "https://www.1mg.com/", "x-city": city, "x-pincode": pincode },
      timeoutMs: 8000,
    });
    const r = data?.data?.search_results?.[0];
    console.log(`  ${city} (${pincode}): ${r?.name} → sp=${r?.prices?.discounted_price}`);
  }

  // 6. Full checkAll test
  console.log("\n--- checkAll() for Dolo 650 (pincode=400001 Mumbai) ---");
  const mockListings: ScrapedListing[] = [
    {
      productName: "Dolo 650mg Strip Of 15 Tablets",
      pharmacyName: "pharmeasy",
      productUrl: PHARMEASY_DOLO,
      inStock: true,
      sellingPrice: 23.45,
      mrp: 32.13,
    },
    {
      productName: "Dolo 650 Tablet 15's",
      pharmacyName: "netmeds",
      productUrl: NETMEDS_DOLO,
      inStock: true,
      sellingPrice: 26.34,
      mrp: 32.12,
    },
    {
      productName: "Dolo 650 Tablet 15",
      pharmacyName: "truemeds",
      productUrl: TRUEMEDS_DOLO,
      inStock: true,
      sellingPrice: 25.70,
      mrp: 32.0,
    },
  ];

  const results = await checkAll(mockListings, "400001");
  for (const [pharmacy, svc] of results.entries()) {
    console.log(
      `  ${pharmacy.padEnd(12)}: inStock=${svc.inStock} serviceable=${svc.serviceable} ` +
      `eta="${svc.deliveryEta}" date="${svc.deliveryEta ? etaToDateLabel(svc.deliveryEta) : "-"}" source=${svc.source}`
    );
  }

  console.log("\n✓ All tests complete");
}

run().catch(console.error);
