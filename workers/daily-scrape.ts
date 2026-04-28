import "dotenv/config";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { scrapeAll } from "../lib/scrapers";

const prisma = new PrismaClient();

async function runOnce() {
  console.log("[CRON] Starting daily scrape...");

  // Cap how many medicines we refresh per run. Free GH Actions runs are
  // capped at ~6 hours; even with the worker's 2s pacing each medicine takes
  // ~10s, so 100 medicines ≈ 17 minutes is a safe default.
  const LIMIT = parseInt(process.env.SCRAPE_LIMIT ?? "100", 10);

  // Priority order:
  //   1. Most-searched medicines (from SearchLog) — high user value
  //   2. Catalog medicines whose listings are oldest / missing
  //   3. Tie-break by name
  const ranked = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT m.id, m.name
    FROM "Medicine" m
    LEFT JOIN (
      SELECT "medicineId", COUNT(*)::int AS hits
      FROM "SearchLog"
      WHERE "createdAt" > NOW() - INTERVAL '30 days'
      GROUP BY "medicineId"
    ) sl ON sl."medicineId" = m.id
    LEFT JOIN (
      SELECT "medicineId", MAX("scrapedAt") AS last_scrape
      FROM "PharmacyListing"
      GROUP BY "medicineId"
    ) pl ON pl."medicineId" = m.id
    WHERE m."isCatalog" = true
    ORDER BY
      COALESCE(sl.hits, 0) DESC,
      pl.last_scrape ASC NULLS FIRST,
      m.name ASC
    LIMIT ${LIMIT}
  `;

  const medicines = ranked;

  if (medicines.length === 0) {
    console.log("[CRON] No medicines in database yet. Nothing to refresh.");
    return;
  }

  console.log(`[CRON] Scraping ${medicines.length} medicines (LIMIT=${LIMIT})`);

  for (const medicine of medicines) {
    const job = await prisma.scrapeJob.create({
      data: { pharmacy: "all", status: "running" },
    });

    try {
      // Hard wall-clock cap: if any pharmacy hangs (anti-bot challenge,
      // network stall), abandon this medicine and move on. Without this
      // a single bad scrape can wedge the entire run.
      const PER_MEDICINE_TIMEOUT_MS = 90_000;
      const listings = await Promise.race([
        scrapeAll(medicine.name, null, { includeBrowser: true }),
        new Promise<never>((_, rej) =>
          setTimeout(
            () => rej(new Error(`Timeout after ${PER_MEDICINE_TIMEOUT_MS}ms`)),
            PER_MEDICINE_TIMEOUT_MS
          )
        ),
      ]);

      await prisma.pharmacyListing.deleteMany({
        where: { medicineId: medicine.id },
      });

      if (listings.length > 0) {
        await prisma.pharmacyListing.createMany({
          data: listings.map((l) => ({
            medicineId: medicine.id,
            pharmacyName: l.pharmacyName,
            brandName: l.brandName,
            productName: l.productName,
            packSize: l.packSize,
            mrp: l.mrp,
            sellingPrice: l.sellingPrice,
            discountPercent: l.discountPercent,
            inStock: l.inStock,
            productUrl: l.productUrl,
          })),
        });

        // Snapshot cheapest-per-pharmacy into price history
        const cheapest = new Map<string, { sellingPrice?: number; mrp?: number }>();
        for (const l of listings) {
          const price = l.sellingPrice ?? l.mrp;
          if (price == null) continue;
          const cur = cheapest.get(l.pharmacyName);
          if (!cur || (cur.sellingPrice ?? cur.mrp ?? Infinity) > price) {
            cheapest.set(l.pharmacyName, { sellingPrice: l.sellingPrice, mrp: l.mrp });
          }
        }
        if (cheapest.size > 0) {
          await prisma.priceHistory.createMany({
            data: Array.from(cheapest.entries()).map(([pharmacyName, p]) => ({
              medicineId: medicine.id,
              pharmacyName,
              sellingPrice: p.sellingPrice,
              mrp: p.mrp,
            })),
          });
        }
      }

      await prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: "success",
          completedAt: new Date(),
          medicinesScraped: listings.length,
        },
      });

      console.log(`[CRON] ${medicine.name}: ${listings.length} listings`);
    } catch (err: any) {
      await prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorMessage: err.message ?? String(err),
        },
      });
      console.error(`[CRON] ${medicine.name} failed:`, err.message);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("[CRON] Daily scrape complete.");
}

if (process.argv.includes("--once")) {
  runOnce()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else {
  cron.schedule("0 2 * * *", runOnce);
  console.log("Worker started. Daily scrape runs at 2:00 AM IST.");
  console.log("Run `tsx workers/daily-scrape.ts --once` for an immediate pass.");
}
