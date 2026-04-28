import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { scrapeAll } from "../lib/scrapers";
import { findJanAushadhiMatch } from "../lib/jan-aushadhi/matcher";
import { normalizeMedicineName } from "../lib/utils";

const prisma = new PrismaClient();

const TOP_MEDICINES = [
  "Paracetamol",
  "Crocin",
  "Dolo 650",
  "Metformin",
  "Atorvastatin",
  "Cetirizine",
  "Pantoprazole",
  "Amoxicillin",
  "Azithromycin",
  "Amlodipine",
  "Telmisartan",
  "Losartan",
  "Glimepiride",
  "Levothyroxine",
  "Ibuprofen",
  "Diclofenac",
  "Omeprazole",
  "Aspirin",
  "Clopidogrel",
  "Rosuvastatin",
];

async function main() {
  console.log(`Pre-scraping top ${TOP_MEDICINES.length} medicines...`);

  for (const name of TOP_MEDICINES) {
    console.log(`\n→ ${name}`);
    try {
      const scraped = await scrapeAll(name);
      const normalized = normalizeMedicineName(name);
      const salt = scraped.find((s) => s.saltComposition)?.saltComposition ?? null;

      const med = await prisma.medicine.upsert({
        where: { normalizedName: normalized },
        update: { saltComposition: salt ?? undefined },
        create: { name, normalizedName: normalized, saltComposition: salt },
      });

      await prisma.pharmacyListing.deleteMany({ where: { medicineId: med.id } });
      if (scraped.length > 0) {
        await prisma.pharmacyListing.createMany({
          data: scraped.map((l) => ({
            medicineId: med.id,
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
      }

      const match = await findJanAushadhiMatch(salt ?? name);
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

      console.log(`   ${scraped.length} listings, JA match: ${match ? match.confidence : "none"}`);
    } catch (err: any) {
      console.error(`   failed: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n✅ Pre-seed complete.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
