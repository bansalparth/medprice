import fs from "fs";
import csv from "csv-parser";
import { prisma } from "@/lib/prisma";
import { normalizeMedicineName } from "@/lib/utils";

interface CSVRow {
  sub_category?: string;
  product_name?: string;
  salt_composition?: string;
  product_price?: string;
  product_manufactured?: string;
  medicine_desc?: string;
  side_effects?: string;
  drug_interactions?: string;
}

interface ProcessedMedicine {
  name: string;
  normalizedName: string;
  category: string | null;
  saltComposition: string | null;
  manufacturer: string | null;
  description: string | null;
  sideEffects: string | null;
  dosageForm: string | null;
  isCatalog: boolean;
  soldOnline: boolean;
  prescriptionRequired: boolean;
  // Track field completeness for merge
  fieldCount: number;
}

// Extract dosage form from product name (Tablet, Capsule, Injection, etc.)
function extractDosageForm(productName: string): string | null {
  const forms = [
    "Injection",
    "Tablet",
    "Capsule",
    "Syrup",
    "Solution",
    "Suspension",
    "Cream",
    "Ointment",
    "Gel",
    "Drops",
    "Powder",
    "Inhaler",
    "Patch",
    "Spray",
  ];

  for (const form of forms) {
    if (new RegExp(`\\b${form}\\b`, "i").test(productName)) {
      return form.charAt(0).toUpperCase() + form.slice(1);
    }
  }
  return null;
}

// Parse price and remove currency symbol
function parsePrice(priceStr: string | undefined): number | null {
  if (!priceStr) return null;
  const numStr = priceStr.replace(/[^0-9.]/g, "");
  const price = parseFloat(numStr);
  return isNaN(price) ? null : price;
}

// Count non-null fields for merge decision
function countFields(med: ProcessedMedicine): number {
  return [
    med.name,
    med.saltComposition,
    med.manufacturer,
    med.description,
    med.sideEffects,
    med.category,
    med.dosageForm,
  ].filter((v) => v != null).length;
}

// Process a CSV row into a medicine object
function processMedicineRow(row: CSVRow): ProcessedMedicine | null {
  const name = row.product_name?.trim();
  if (!name) return null;

  const normalizedName = normalizeMedicineName(name);
  const dosageForm = extractDosageForm(name);

  const medicine: ProcessedMedicine = {
    name,
    normalizedName,
    category: row.sub_category?.trim() || null,
    saltComposition: row.salt_composition?.trim() || null,
    manufacturer: row.product_manufactured?.trim() || null,
    description: row.medicine_desc?.trim() || null,
    sideEffects: row.side_effects?.trim() || null,
    dosageForm,
    isCatalog: true,
    soldOnline: true,
    prescriptionRequired: false,
    fieldCount: 0,
  };

  medicine.fieldCount = countFields(medicine);
  return medicine;
}

// Merge two medicines, keeping the one with more complete data
function mergeMedicines(a: ProcessedMedicine, b: ProcessedMedicine): ProcessedMedicine {
  if (b.fieldCount > a.fieldCount) {
    return { ...b, fieldCount: countFields(b) };
  }
  // Fill in missing fields from b if a doesn't have them
  const merged = { ...a };
  if (!merged.category && b.category) merged.category = b.category;
  if (!merged.saltComposition && b.saltComposition) merged.saltComposition = b.saltComposition;
  if (!merged.manufacturer && b.manufacturer) merged.manufacturer = b.manufacturer;
  if (!merged.description && b.description) merged.description = b.description;
  if (!merged.sideEffects && b.sideEffects) merged.sideEffects = b.sideEffects;
  if (!merged.dosageForm && b.dosageForm) merged.dosageForm = b.dosageForm;
  merged.fieldCount = countFields(merged);
  return merged;
}

async function insertBatch(
  medicines: ProcessedMedicine[],
  batchNum: number
): Promise<number> {
  try {
    // Check which medicines already exist in the database
    const normalizedNames = medicines.map((m) => m.normalizedName);
    const existing = await prisma.medicine.findMany({
      where: { normalizedName: { in: normalizedNames } },
      select: { normalizedName: true },
    });
    const existingSet = new Set(existing.map((m) => m.normalizedName));

    // Filter out duplicates
    const toInsert = medicines.filter((m) => !existingSet.has(m.normalizedName));

    if (toInsert.length === 0) {
      console.log(`ℹ Batch ${batchNum}: All ${medicines.length} medicines already exist, skipping`);
      return 0;
    }

    const result = await prisma.medicine.createMany({
      data: toInsert.map((m) => ({
        name: m.name,
        normalizedName: m.normalizedName,
        category: m.category,
        saltComposition: m.saltComposition,
        manufacturer: m.manufacturer,
        description: m.description,
        sideEffects: m.sideEffects,
        dosageForm: m.dosageForm,
        isCatalog: m.isCatalog,
        soldOnline: m.soldOnline,
        prescriptionRequired: m.prescriptionRequired,
      })),
    });

    const skipped = medicines.length - toInsert.length;
    if (skipped > 0) {
      console.log(
        `✓ Batch ${batchNum}: Inserted ${result.count}/${toInsert.length} (${skipped} already exist)`
      );
    } else {
      console.log(
        `✓ Batch ${batchNum}: Inserted ${result.count}/${medicines.length} medicines`
      );
    }
    return result.count;
  } catch (error) {
    console.error(`✗ Batch ${batchNum} failed:`, error instanceof Error ? error.message : error);
    return 0;
  }
}

async function importMedicinesFromCSV(filePath: string) {
  console.log(`📋 Starting import from: ${filePath}\n`);

  const medicinesByNormalized = new Map<string, ProcessedMedicine>();
  let rowsRead = 0;
  let skippedInvalid = 0;

  return new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row: CSVRow) => {
        rowsRead++;

        const medicine = processMedicineRow(row);
        if (!medicine) {
          skippedInvalid++;
          return;
        }

        const existing = medicinesByNormalized.get(medicine.normalizedName);
        if (existing) {
          // Merge: keep the one with more complete data
          medicinesByNormalized.set(medicine.normalizedName, mergeMedicines(existing, medicine));
        } else {
          medicinesByNormalized.set(medicine.normalizedName, medicine);
        }
      })
      .on("end", async () => {
        console.log(`📖 Read ${rowsRead} rows from CSV`);
        console.log(`🚫 Skipped ${skippedInvalid} invalid rows (missing name)\n`);

        const medicines = Array.from(medicinesByNormalized.values());
        console.log(`📦 Processing ${medicines.length} unique medicines (after merge)\n`);

        const BATCH_SIZE = 500;
        let totalInserted = 0;
        let batchNum = 0;

        for (let i = 0; i < medicines.length; i += BATCH_SIZE) {
          batchNum++;
          const batch = medicines.slice(i, i + BATCH_SIZE);
          const inserted = await insertBatch(batch, batchNum);
          totalInserted += inserted;

          // Progress indicator
          const pct = ((i + BATCH_SIZE) / medicines.length * 100).toFixed(1);
          console.log(
            `⏳ Progress: ${Math.min(i + BATCH_SIZE, medicines.length)}/${medicines.length} (${pct}%)`
          );
        }

        console.log(`\n✅ Import complete!`);
        console.log(`   Total medicines inserted: ${totalInserted}`);
        console.log(`   Skipped (duplicates): ${medicines.length - totalInserted}\n`);

        // Verify
        const count = await prisma.medicine.count();
        console.log(`📊 Database now contains ${count} medicines total`);

        await prisma.$disconnect();
        resolve();
      })
      .on("error", (error) => {
        console.error("❌ CSV read error:", error);
        prisma.$disconnect().then(() => reject(error));
      });
  });
}

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: npm run import-csv -- <path-to-csv-file>");
  console.error("Example: npm run import-csv -- ./medicines.csv");
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`❌ File not found: ${csvPath}`);
  process.exit(1);
}

importMedicinesFromCSV(csvPath).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
