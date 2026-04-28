import "dotenv/config";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { scrapeAll } from "../lib/scrapers";

const prisma = new PrismaClient();

async function runOnce() {
  console.log("[CRON] Starting daily scrape...");

  const medicines = await prisma.medicine.findMany({
    select: { id: true, name: true },
  });

  if (medicines.length === 0) {
    console.log("[CRON] No medicines in database yet. Nothing to refresh.");
    return;
  }

  for (const medicine of medicines) {
    const job = await prisma.scrapeJob.create({
      data: { pharmacy: "all", status: "running" },
    });

    try {
      const listings = await scrapeAll(medicine.name);

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
