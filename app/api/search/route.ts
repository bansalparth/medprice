import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeAll, type ScrapedListing } from "@/lib/scrapers";
import { findJanAushadhiMatch } from "@/lib/jan-aushadhi/matcher";
import { normalizeMedicineName } from "@/lib/utils";
import { estimateDelivery } from "@/lib/delivery";
import { lookupDrugDetail } from "@/lib/drug-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Short-TTL in-memory dedupe so two near-simultaneous requests for the same
// medicine reuse the same in-flight scrape instead of launching it twice.
const inflight = new Map<string, Promise<ScrapedListing[]>>();
const INFLIGHT_TTL_MS = 30_000;

/**
 * Search returns one specific medicine's prices across pharmacies.
 *
 * Two ways to call:
 *  - ?medicineId=xxx     (preferred — exact catalog match)
 *  - ?q=text             (legacy free-text — still supported for back-compat)
 */
export async function GET(req: NextRequest) {
  const medicineIdParam = req.nextUrl.searchParams.get("medicineId")?.trim();
  const queryParam = req.nextUrl.searchParams.get("q")?.trim();
  const inputMethod = req.nextUrl.searchParams.get("method") ?? "text";
  const pincode = req.nextUrl.searchParams.get("pincode") ?? null;

  if (!medicineIdParam && !queryParam) {
    return NextResponse.json(
      { error: "Provide either medicineId or q" },
      { status: 400 }
    );
  }

  // Resolve to a Medicine row
  let medRow = medicineIdParam
    ? await prisma.medicine.findUnique({
        where: { id: medicineIdParam },
      })
    : null;

  if (!medRow && queryParam) {
    medRow = await prisma.medicine.findFirst({
      where: { normalizedName: normalizeMedicineName(queryParam) },
    });
  }

  // Fallback: if free-text and no catalog match, create a transient row
  if (!medRow && queryParam) {
    medRow = await prisma.medicine.upsert({
      where: { normalizedName: normalizeMedicineName(queryParam) },
      update: {},
      create: {
        name: queryParam,
        normalizedName: normalizeMedicineName(queryParam),
        isCatalog: false,
      },
    });
  }

  if (!medRow) {
    return NextResponse.json({ error: "Medicine not found" }, { status: 404 });
  }

  // Log the search
  prisma.searchLog
    .create({
      data: {
        query: queryParam ?? medRow.name,
        medicineId: medRow.id,
        inputMethod,
      },
    })
    .catch(() => {});

  // Build the precise scrape query — for catalog entries we use the FULL display
  // name (e.g., "Crocin Advance Tablet" → matches that brand only)
  const scrapeQuery = medRow.brandName
    ? `${medRow.brandName} ${medRow.dosageForm ?? ""}`.trim()
    : medRow.name;

  // Check cached fresh listings — pincode-aware so different cities don't
  // collide on the same cache row. Listings without a pincode are reusable
  // across users (national catalogue entries).
  const cachedMed = await prisma.medicine.findUnique({
    where: { id: medRow.id },
    include: {
      listings: {
        where: {
          scrapedAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
          OR: [
            { pincode: pincode ?? undefined },
            { pincode: null },
          ],
        },
        orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }],
      },
      saltMappings: { include: { janAushadhiProduct: true } },
    },
  });

  if (cachedMed && cachedMed.listings.length > 0) {
    return NextResponse.json({
      medicine: enrich(cachedMed, pincode),
      cached: true,
      pincode,
    });
  }

  // Live scrape using the precise brand+form query — dedupe concurrent calls.
  const scrapeKey = `${scrapeQuery}::${pincode ?? ""}`;
  let scrapePromise = inflight.get(scrapeKey);
  if (!scrapePromise) {
    scrapePromise = scrapeAll(scrapeQuery, pincode);
    inflight.set(scrapeKey, scrapePromise);
    setTimeout(() => inflight.delete(scrapeKey), INFLIGHT_TTL_MS);
  }
  const scraped = await scrapePromise;

  if (scraped.length === 0) {
    if (cachedMed) {
      const stale = await prisma.medicine.findUnique({
        where: { id: medRow.id },
        include: {
          listings: { orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }] },
          saltMappings: { include: { janAushadhiProduct: true } },
        },
      });
      return NextResponse.json({
        medicine: enrich(stale, pincode),
        cached: true,
        stale: true,
        pincode,
      });
    }
    const fullMedEmpty = await prisma.medicine.findUnique({
      where: { id: medRow.id },
      include: {
        listings: { orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }] },
        saltMappings: { include: { janAushadhiProduct: true } },
      },
    });
    return NextResponse.json({
      medicine: enrich(fullMedEmpty, pincode),
      cached: false,
      scraped: [],
      pincode,
    });
  }

  // FILTER scraped results to ones that actually match what the user picked.
  //
  // Pharmacy search results include cross-sells ("Crocin 650" search returns
  // "Crocin Advance" suggestions, etc.). We need ALL distinctive parts of the
  // brand to appear in the product name — including the strength number,
  // since "Crocin 650" vs "Crocin Advance" is differentiated by 650 vs the
  // word "Advance".
  //
  // Strategy:
  //   - Tokenize brand name (or fallback to medicine name) into alpha + numeric tokens.
  //   - Require ALL tokens to match the product name with word-boundary regex.
  //   - For numeric tokens, allow an optional unit suffix (mg, mcg, ml, %, etc.)
  //     since pharmacies write "650mg" or "650 mg" interchangeably.

  const escapeRe = (s: string) =>
    s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

  const tokenRegex = (tok: string): RegExp => {
    const esc = escapeRe(tok);
    if (/^\d+(\.\d+)?$/.test(tok)) {
      // Numeric: allow optional unit suffix glued or spaced after digits
      return new RegExp(
        `\\b${esc}(?:\\s?(?:mg|mcg|ml|gm|g|iu|%))?\\b`,
        "i"
      );
    }
    return new RegExp(`\\b${esc}\\b`, "i");
  };

  const sourceText = medRow.brandName ?? medRow.name;
  const brandTokens = sourceText
    .toLowerCase()
    // keep digits, decimals, and word chars; replace everything else with space
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    // drop empty / lone-period / common dosage-form noise
    .filter(
      (t) =>
        t.length >= 1 &&
        t !== "." &&
        !["tablet", "capsule", "syrup", "drops", "injection", "cream", "gel"].includes(t)
    );

  const tokenRegexes = brandTokens.map(tokenRegex);

  // Bundle/multi-pack blacklist — these are not the standard SKU.
  // "Combo Pack of...", "Fever Management Combo... & Crocin", "Pack of 4 strips" etc.
  const BUNDLE_RE =
    /\b(combo|hamper|combination|with\s+free)\b|\bpack\s+of\s+([2-9]|\d{2,})\b|\bthermometer\b|&\s/i;

  // Pull the catalog primary strength so we can reject mismatches.
  // e.g., Crocin 650 catalog has 650mg; reject scraped "Crocin Advance 500mg".
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

  // Decide whether a bare number in the product name is a count (pack size,
  // tablet count) or a strength.
  const isCountContext = (name: string, num: number): boolean => {
    // Apostrophe-s: "10's", "20's"
    if (new RegExp(`\\b${num}\\s?'s\\b`, "i").test(name)) return true;
    // "Strip of 15", "Pack of 100", "Bottle of 30", "Box of 4"
    if (
      new RegExp(
        `(?:strip|pack|bottle|box|jar|carton)\\s+of\\s+${num}\\b`,
        "i"
      ).test(name)
    )
      return true;
    // Small number directly before tablets/capsules/drops/sachets etc.
    if (
      num < 50 &&
      new RegExp(
        `\\b${num}\\s?(?:tab(?:lets?)?|cap(?:sules?)?|drops?|sachets?|pieces?|units?)\\b`,
        "i"
      ).test(name)
    )
      return true;
    return false;
  };

  // Extract dosage strengths from a product name. Two passes:
  //   1. Numbers with an explicit unit (mg/mcg/gm/iu/%) — high confidence.
  //   2. Bare 2-4 digit numbers ≥50 that aren't in a count context — likely
  //      strength even when the merchant didn't write "mg" explicitly
  //      (e.g., "Crocin 650 Advance Tablet").
  const extractStrengths = (name: string): number[] => {
    const lower = name.toLowerCase();
    const out: number[] = [];

    // Pass 1: explicit unit
    const unitMatches =
      lower.match(/\b(\d+(?:\.\d+)?)\s?(?:mg|mcg|gm|iu|%)\b/g) ?? [];
    for (const m of unitMatches) {
      const n = parseFloat(m);
      if (!isNaN(n)) out.push(n);
    }

    // Pass 2: bare numbers ≥ 50 not in count context
    const bareMatches = lower.match(/\b(\d{2,4}(?:\.\d+)?)\b/g) ?? [];
    for (const m of bareMatches) {
      const n = parseFloat(m);
      if (isNaN(n) || n < 50) continue;
      if (out.includes(n)) continue;
      // Skip if it's a volume ("60ml") — different unit, not a strength conflict
      if (new RegExp(`\\b${m}\\s?ml\\b`, "i").test(name)) continue;
      if (isCountContext(name, n)) continue;
      out.push(n);
    }

    return out;
  };

  // Formulation suffixes — different release profiles / delivery mechanisms.
  // "Avomine Tablet" and "Avomine Tablet MD" are clinically different products.
  // We extract the suffix set from both the catalog name and each scraped
  // product, and reject any mismatch.
  const FORMULATION_SUFFIXES = [
    "md",   // Mouth Dissolving
    "odt",  // Orally Disintegrating Tablet
    "dt",   // Dispersible Tablet
    "sr",   // Sustained Release
    "er",   // Extended Release
    "xl",   // Extended Long
    "xr",   // Extended Release
    "cr",   // Controlled Release
    "pr",   // Prolonged Release
    "la",   // Long Acting
    "ir",   // Immediate Release
    "fc",   // Film Coated
    "ec",   // Enteric Coated
    "chewable",
  ];
  const extractSuffixes = (name: string): Set<string> => {
    const lower = name.toLowerCase();
    const found = new Set<string>();
    for (const sfx of FORMULATION_SUFFIXES) {
      if (new RegExp(`\\b${sfx}\\b`, "i").test(lower)) {
        found.add(sfx);
      }
    }
    return found;
  };
  const catalogSuffixes = extractSuffixes(sourceText);

  let relevantScraped = scraped;
  if (tokenRegexes.length > 0) {
    relevantScraped = scraped.filter((s) => {
      // 1. Reject obvious bundles / multi-packs
      if (BUNDLE_RE.test(s.productName)) return false;

      // 2. Brand tokens must all be present
      if (!tokenRegexes.every((re) => re.test(s.productName))) return false;

      // 3. If we know the primary strength, the product's strengths (if any
      //    are mentioned) must include ours. If the product lists no strength
      //    at all we accept it (some listings just say "Avomine Tablet 10's").
      if (primaryStrength != null) {
        const prodStrengths = extractStrengths(s.productName);
        if (prodStrengths.length > 0 && !prodStrengths.includes(primaryStrength)) {
          return false;
        }
      }

      // 4. Formulation suffix must match. If catalog says plain "Avomine
      //    Tablet" (no MD/SR/etc.), reject "Avomine 25mg Tablet MD". If
      //    catalog explicitly has "MD", require the product to have it too.
      const prodSuffixes = extractSuffixes(s.productName);
      if (catalogSuffixes.size === 0 && prodSuffixes.size > 0) return false;
      for (const sfx of catalogSuffixes) {
        if (!prodSuffixes.has(sfx)) return false;
      }

      return true;
    });
    // No fallback — better to return empty than to leak cross-sell results.
  }

  if (relevantScraped.length === 0) {
    // Re-fetch with relations so the client gets a well-formed shape even when
    // there are zero matching scraped listings. enrich() then guarantees the
    // listings/drugDetail fields the UI expects.
    const fullMedEmpty = await prisma.medicine.findUnique({
      where: { id: medRow.id },
      include: {
        listings: { orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }] },
        saltMappings: { include: { janAushadhiProduct: true } },
      },
    });
    return NextResponse.json({
      medicine: enrich(fullMedEmpty, pincode),
      cached: false,
      scraped: [],
      pincode,
      message: `No live listings matched the brand "${medRow.brandName ?? medRow.name}". The drug may be out of stock everywhere or our scrapers are being blocked.`,
    });
  }

  // Update saltComposition. For catalog entries we trust the curated value
  // and never overwrite it. For non-catalog entries the existing value may
  // be stale/wrong (e.g., from a prior scrape that picked up a cross-sell
  // product's salt), so we always refresh it from the new strict scrape.
  const newSalt =
    relevantScraped.find((s) => s.saltComposition)?.saltComposition ?? null;

  const saltComposition = medRow.isCatalog
    ? medRow.saltComposition ?? newSalt
    : newSalt ?? medRow.saltComposition;

  // Auto-promote: if this is a non-catalog entry and we got a clean scrape,
  // populate brandName from the first relevant listing for future searches.
  if (!medRow.isCatalog) {
    const firstListing = relevantScraped[0];
    const detectedBrand = firstListing?.brandName ?? medRow.name;
    await prisma.medicine.update({
      where: { id: medRow.id },
      data: {
        saltComposition: saltComposition ?? undefined,
        brandName: medRow.brandName ?? detectedBrand,
        packSize: medRow.packSize ?? firstListing?.packSize ?? undefined,
      },
    });
  } else if (saltComposition && !medRow.saltComposition) {
    await prisma.medicine.update({
      where: { id: medRow.id },
      data: { saltComposition },
    });
  }

  // Replace listings (only the ones relevant to this brand)
  await prisma.pharmacyListing.deleteMany({ where: { medicineId: medRow.id } });
  await prisma.pharmacyListing.createMany({
    data: relevantScraped.map((s) => {
      const eta = estimateDelivery(s.pharmacyName, pincode);
      // Listings without ANY price are not buyable, regardless of what the
      // scraper detected — discontinued / not-for-online-sale products on
      // pharmacy sites often hide the price entirely.
      const hasPrice = s.sellingPrice != null || s.mrp != null;
      return {
        medicineId: medRow!.id,
        pharmacyName: s.pharmacyName,
        brandName: s.brandName,
        productName: s.productName,
        packSize: s.packSize,
        mrp: s.mrp,
        sellingPrice: s.sellingPrice,
        discountPercent: s.discountPercent,
        // Mark as out of stock if we know the pincode is unserviceable, or
        // if the listing has no price (can't actually be bought).
        inStock: s.inStock && eta.serviceable && hasPrice,
        productUrl: s.productUrl,
        deliveryEta: eta.eta,
        pincode: pincode ?? null,
      };
    }),
  });

  // Price history snapshot — cheapest in-stock per pharmacy
  const cheapestPerPharmacy = new Map<
    string,
    { sellingPrice?: number; mrp?: number }
  >();
  for (const s of relevantScraped) {
    if (!s.inStock) continue;
    const cur = cheapestPerPharmacy.get(s.pharmacyName);
    const price = s.sellingPrice ?? s.mrp;
    if (price == null) continue;
    if (!cur || (cur.sellingPrice ?? cur.mrp ?? Infinity) > price) {
      cheapestPerPharmacy.set(s.pharmacyName, {
        sellingPrice: s.sellingPrice,
        mrp: s.mrp,
      });
    }
  }
  if (cheapestPerPharmacy.size > 0) {
    await prisma.priceHistory.createMany({
      data: Array.from(cheapestPerPharmacy.entries()).map(
        ([pharmacyName, p]) => ({
          medicineId: medRow!.id,
          pharmacyName,
          sellingPrice: p.sellingPrice,
          mrp: p.mrp,
        })
      ),
    });
  }

  // Salt mapping to Jan Aushadhi
  const matchTarget = saltComposition ?? medRow.brandName ?? medRow.name;
  const match = await findJanAushadhiMatch(matchTarget);
  if (match) {
    await prisma.saltMapping
      .upsert({
        where: {
          medicineId_janAushadhiProductId: {
            medicineId: medRow.id,
            janAushadhiProductId: match.product.id,
          },
        },
        update: { matchConfidence: match.confidence },
        create: {
          medicineId: medRow.id,
          janAushadhiProductId: match.product.id,
          matchConfidence: match.confidence,
        },
      })
      .catch(() => {});
  }

  const fullMed = await prisma.medicine.findUnique({
    where: { id: medRow.id },
    include: {
      listings: { orderBy: [{ inStock: "desc" }, { sellingPrice: "asc" }] },
      saltMappings: { include: { janAushadhiProduct: true } },
    },
  });

  return NextResponse.json({
    medicine: enrich(fullMed, pincode),
    cached: false,
    pincode,
  });
}

/**
 * Decorate the medicine row with auxiliary fields the UI uses:
 *   - drugDetail: curated uses/sideEffects/warnings (falls back to DB row)
 *   - listings: ensure each has a `deliveryEta` (compute on the fly for legacy rows)
 */
function enrich(med: any, pincode: string | null) {
  if (!med) return med;
  const detail = lookupDrugDetail(med.brandName, med.ingredients);
  const drugDetail = {
    uses: med.uses ?? detail?.uses ?? null,
    howItWorks: med.howItWorks ?? detail?.howItWorks ?? null,
    sideEffects: med.sideEffects ?? detail?.sideEffects ?? null,
    warnings: med.warnings ?? detail?.warnings ?? null,
    storage: med.storage ?? detail?.storage ?? null,
    prescriptionRequired:
      med.prescriptionRequired ?? detail?.prescriptionRequired ?? false,
    soldOnline: med.soldOnline ?? detail?.soldOnline ?? true,
  };
  const listings = (med.listings ?? []).map((l: any) => ({
    ...l,
    deliveryEta: l.deliveryEta ?? estimateDelivery(l.pharmacyName, pincode).eta,
  }));
  const saltMappings = med.saltMappings ?? [];
  return { ...med, listings, saltMappings, drugDetail };
}
