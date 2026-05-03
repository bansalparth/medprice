import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeAll } from "@/lib/scrapers";
import { findJanAushadhiMatch } from "@/lib/jan-aushadhi/matcher";
import { normalizeMedicineName } from "@/lib/utils";
import { PHARMACIES } from "@/lib/scrapers/types";
import { estimateDelivery } from "@/lib/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface BasketItem {
  query: string;
  medicineId: string | null;
  medicineName: string;
  perPharmacy: Record<
    string,
    {
      productName: string;
      price: number;
      productUrl: string | null;
      inStock: boolean;
      deliveryEta: string;
    } | null
  >;
  janAushadhiPrice: number | null;
}

async function processOne(
  query: string,
  pincode: string | null
): Promise<BasketItem> {
  const normalized = normalizeMedicineName(query);

  let med = await prisma.medicine.findFirst({
    where: { normalizedName: normalized },
    include: {
      listings: {
        where: {
          scrapedAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
          OR: [{ pincode: pincode ?? undefined }, { pincode: null }],
        },
        orderBy: { sellingPrice: "asc" },
      },
      saltMappings: { include: { janAushadhiProduct: true } },
    },
  });

  let listings = med?.listings ?? [];

  if (listings.length === 0) {
    const allScraped = await scrapeAll(query, pincode);

    // Relevance filter: same brand-token logic as search route
    const brandTokens = query
      .toLowerCase()
      .replace(/[^a-z0-9.\s]/g, " ")
      .split(/\s+/)
      .filter(
        (t) =>
          t.length >= 1 &&
          t !== "." &&
          !["tablet", "capsule", "syrup", "drops", "injection", "cream", "gel"].includes(t)
      );
    const tokenRegexes = brandTokens.map((tok) => {
      const esc = tok.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      if (/^\d+(\.\d+)?$/.test(tok))
        return new RegExp(`\\b${esc}(?:\\s?(?:mg|mcg|ml|gm|g|iu|%))?\\b`, "i");
      return new RegExp(`\\b${esc}\\b`, "i");
    });
    const scraped =
      tokenRegexes.length > 0
        ? allScraped.filter((s) =>
            tokenRegexes.every((re) => re.test(s.productName))
          )
        : allScraped;

    if (scraped.length > 0) {
      const salt = scraped.find((s) => s.saltComposition)?.saltComposition ?? null;
      med = await prisma.medicine.upsert({
        where: { normalizedName: normalized },
        update: { saltComposition: salt ?? undefined },
        create: { name: query, normalizedName: normalized, saltComposition: salt },
        include: {
          listings: { orderBy: { sellingPrice: "asc" } },
          saltMappings: { include: { janAushadhiProduct: true } },
        },
      });

      await prisma.pharmacyListing.deleteMany({ where: { medicineId: med.id } });
      await prisma.pharmacyListing.createMany({
        data: scraped.map((s) => {
          const eta = estimateDelivery(s.pharmacyName, pincode);
          const hasPrice = s.sellingPrice != null || s.mrp != null;
          return {
            medicineId: med!.id,
            pharmacyName: s.pharmacyName,
            brandName: s.brandName,
            productName: s.productName,
            packSize: s.packSize,
            mrp: s.mrp,
            sellingPrice: s.sellingPrice,
            discountPercent: s.discountPercent,
            inStock: s.inStock && eta.serviceable && hasPrice,
            productUrl: s.productUrl,
            deliveryEta: eta.eta,
            pincode: pincode ?? null,
          };
        }),
      });

      // Snapshot history
      const cheapest = new Map<string, number>();
      for (const s of scraped) {
        const p = s.sellingPrice ?? s.mrp;
        if (p == null) continue;
        const cur = cheapest.get(s.pharmacyName);
        if (cur == null || p < cur) cheapest.set(s.pharmacyName, p);
      }
      if (cheapest.size > 0) {
        await prisma.priceHistory.createMany({
          data: Array.from(cheapest.entries()).map(([pharmacyName, sellingPrice]) => ({
            medicineId: med!.id,
            pharmacyName,
            sellingPrice,
          })),
        });
      }

      const match = await findJanAushadhiMatch(salt ?? query);
      if (match) {
        await prisma.saltMapping
          .upsert({
            where: {
              medicineId_janAushadhiProductId: {
                medicineId: med.id,
                janAushadhiProductId: match.product.id,
              },
            },
            update: { matchConfidence: match.confidence },
            create: {
              medicineId: med.id,
              janAushadhiProductId: match.product.id,
              matchConfidence: match.confidence,
            },
          })
          .catch(() => {});
      }

      med = await prisma.medicine.findUnique({
        where: { id: med.id },
        include: {
          listings: { orderBy: { sellingPrice: "asc" } },
          saltMappings: { include: { janAushadhiProduct: true } },
        },
      });
      listings = med?.listings ?? [];
    }
  }

  // Cheapest per pharmacy
  const perPharmacy: BasketItem["perPharmacy"] = {};
  for (const ph of PHARMACIES) {
    const cheapest = listings
      .filter((l) => l.pharmacyName === ph && l.sellingPrice != null)
      .sort((a, b) => (a.sellingPrice ?? 0) - (b.sellingPrice ?? 0))[0];
    perPharmacy[ph] = cheapest
      ? {
          productName: cheapest.productName,
          price: cheapest.sellingPrice ?? 0,
          productUrl: cheapest.productUrl ?? null,
          inStock: cheapest.inStock,
          deliveryEta:
            cheapest.deliveryEta ?? estimateDelivery(ph, pincode).eta,
        }
      : null;
  }

  const ja = med?.saltMappings?.[0]?.janAushadhiProduct ?? null;

  return {
    query,
    medicineId: med?.id ?? null,
    medicineName: med?.name ?? query,
    perPharmacy,
    janAushadhiPrice: ja?.mrpBppi ?? null,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const queries = body.queries;
  const pincode: string | null =
    typeof body.pincode === "string" && body.pincode.length >= 6
      ? body.pincode
      : null;
  if (!Array.isArray(queries) || queries.length === 0) {
    return NextResponse.json({ error: "queries array required" }, { status: 400 });
  }

  // Process sequentially to avoid spinning up 3+ Playwright browsers at once
  const items: BasketItem[] = [];
  for (const q of queries.slice(0, 10)) {
    if (typeof q !== "string" || !q.trim()) continue;
    items.push(await processOne(q.trim(), pincode));
  }

  // Compute per-pharmacy total (only counting medicines that pharmacy has)
  const totals: Record<string, { total: number; covered: number; missing: string[] }> =
    {};
  for (const ph of PHARMACIES) {
    let total = 0;
    let covered = 0;
    const missing: string[] = [];
    for (const item of items) {
      const e = item.perPharmacy[ph];
      if (e) {
        total += e.price;
        covered += 1;
      } else {
        missing.push(item.medicineName);
      }
    }
    totals[ph] = { total: Math.round(total * 100) / 100, covered, missing };
  }

  // Jan Aushadhi total
  let jaTotal = 0;
  let jaCovered = 0;
  const jaMissing: string[] = [];
  for (const item of items) {
    if (item.janAushadhiPrice != null) {
      jaTotal += item.janAushadhiPrice;
      jaCovered += 1;
    } else {
      jaMissing.push(item.medicineName);
    }
  }

  return NextResponse.json({
    items,
    totals,
    janAushadhi: {
      total: Math.round(jaTotal * 100) / 100,
      covered: jaCovered,
      missing: jaMissing,
    },
  });
}
