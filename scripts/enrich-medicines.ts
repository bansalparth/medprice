/**
 * Post-import enrichment pass.
 * Goes through all medicines in the database that have null howItWorks/warnings/storage
 * and enriches them using the DRUG_DETAILS salt lookup.
 *
 * Run: npm run enrich-medicines
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { lookupDrugDetail } from "../lib/drug-details";

const prisma = new PrismaClient();
const BATCH_SIZE = 1000;

async function main() {
  console.log("🔬 Starting enrichment pass...");

  let cursor: string | undefined;
  let total = 0;
  let enriched = 0;

  const grandTotal = await prisma.medicine.count();
  console.log(`   Database has ${grandTotal.toLocaleString()} medicines total`);

  while (true) {
    const batch = await prisma.medicine.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: {
        OR: [
          { howItWorks: null },
          { warnings: null },
          { storage: null },
          { prescriptionRequired: false }, // may have been left at default
        ],
      },
      select: {
        id: true,
        brandName: true,
        ingredients: true,
        saltComposition: true,
        howItWorks: true,
        warnings: true,
        storage: true,
        uses: true,
        sideEffects: true,
        prescriptionRequired: true,
      },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    total += batch.length;

    const updates: Promise<unknown>[] = [];

    for (const med of batch) {
      const detail = lookupDrugDetail(
        med.brandName,
        med.ingredients,
        med.saltComposition,
      );
      if (!detail) continue;

      const data: Record<string, string | boolean | null> = {};
      if (!med.howItWorks && detail.howItWorks) data.howItWorks = detail.howItWorks;
      if (!med.warnings && detail.warnings) data.warnings = detail.warnings;
      if (!med.storage && detail.storage) data.storage = detail.storage;
      if (!med.uses && detail.uses) data.uses = detail.uses;
      if (!med.sideEffects && detail.sideEffects) data.sideEffects = detail.sideEffects;
      // Update prescriptionRequired only if the detail says it should be true
      if (!med.prescriptionRequired && detail.prescriptionRequired) {
        data.prescriptionRequired = true;
      }

      if (Object.keys(data).length > 0) {
        enriched++;
        updates.push(prisma.medicine.update({ where: { id: med.id }, data }));
      }
    }

    if (updates.length > 0) await Promise.all(updates);

    const pct = ((total / grandTotal) * 100).toFixed(1);
    process.stdout.write(`\r⏳ Processed ${total.toLocaleString()}/${grandTotal.toLocaleString()} (${pct}%) — enriched ${enriched.toLocaleString()}`);
  }

  console.log();
  console.log(`\n✅ Enrichment complete!`);
  console.log(`   Medicines processed: ${total.toLocaleString()}`);
  console.log(`   Medicines enriched: ${enriched.toLocaleString()}`);
  console.log(`   No match found: ${(total - enriched).toLocaleString()}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
