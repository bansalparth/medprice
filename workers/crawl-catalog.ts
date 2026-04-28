import "dotenv/config";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { newPage, jitter, safeEvaluate } from "../lib/scrapers/browser";
import { normalizeMedicineName } from "../lib/utils";

const prisma = new PrismaClient();

/**
 * Catalog crawler — discovers new medicines from PharmEasy's A-Z product
 * index pages and adds them to the catalog (no prices). Prices are still
 * fetched on-demand by the search route.
 *
 * PharmEasy pattern: /browse-medicine?page=N&sort=alphabetical (paginated)
 * We fetch a small slice per run so we don't hammer the site.
 */

interface DiscoveredDrug {
  name: string;
  brand: string;
  manufacturer?: string;
  packSize?: string;
  productUrl?: string;
}

async function crawlPharmEasyPage(page: number): Promise<DiscoveredDrug[]> {
  const handle = await newPage();
  try {
    const url = `https://pharmeasy.in/online-medicine-order/all?page=${page}`;
    await handle.page.goto(url, { waitUntil: "domcontentloaded" });
    await jitter(2000, 3500);
    await handle.page.evaluate(() => window.scrollTo(0, 1500));
    await jitter(1500, 2500);

    return await safeEvaluate(handle.page, () => {
      const cards = Array.from(
        document.querySelectorAll('[class*="ProductCard_medicineUnitContainer"]')
      );

      return cards.map((card) => {
        const text = (sel: string) =>
          card.querySelector(sel)?.textContent?.trim() ?? undefined;

        const name = text('[class*="ProductCard_medicineName"]') ?? "";
        const brand = name.split(/\s+\d/)[0] ?? name;
        const manufacturer = text('[class*="ProductCard_brandName"]')?.replace(
          /^By\s+/i,
          ""
        );
        const pack = text('[class*="ProductCard_measurementUnit"]');
        const link =
          (card.querySelector("a") as HTMLAnchorElement | null)?.href ?? undefined;

        return { name, brand, manufacturer, packSize: pack, productUrl: link };
      });
    });
  } finally {
    await handle.close();
  }
}

async function runOnce(maxPages = 3) {
  console.log("[catalog-crawl] starting...");
  const job = await prisma.scrapeJob.create({
    data: { pharmacy: "catalog-crawl", status: "running" },
  });

  let added = 0;
  let scanned = 0;
  try {
    for (let p = 1; p <= maxPages; p++) {
      console.log(`[catalog-crawl] page ${p}...`);
      const drugs = await crawlPharmEasyPage(p).catch((e) => {
        console.error(`page ${p} failed:`, e.message);
        return [] as DiscoveredDrug[];
      });
      scanned += drugs.length;

      for (const d of drugs) {
        if (!d.name || d.name.length < 3) continue;
        const normalized = normalizeMedicineName(d.name);
        const existing = await prisma.medicine.findUnique({
          where: { normalizedName: normalized },
        });
        if (existing) continue;
        await prisma.medicine.create({
          data: {
            name: d.name,
            normalizedName: normalized,
            brandName: d.brand,
            manufacturer: d.manufacturer,
            packSize: d.packSize,
            isCatalog: true,
          },
        });
        added++;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "success",
        completedAt: new Date(),
        medicinesScraped: added,
      },
    });
    console.log(`[catalog-crawl] done. scanned=${scanned} added=${added}`);
  } catch (err: any) {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err.message,
      },
    });
    console.error("[catalog-crawl] failed:", err);
  }
}

if (process.argv.includes("--once")) {
  const pages = parseInt(process.argv[process.argv.indexOf("--pages") + 1] ?? "3");
  runOnce(pages)
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else {
  // Daily at 03:30 IST (after the 02:00 price refresh)
  cron.schedule("30 3 * * *", () => runOnce(5));
  console.log(
    "Catalog crawler scheduled: daily 03:30 IST. Run with --once for an immediate pass."
  );
}
