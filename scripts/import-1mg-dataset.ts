/**
 * Imports the 1mg medicine dataset CSV (248k rows) into the Medicine table.
 *
 * CSV columns: id, name, substitute0-4, sideEffect0-41, use0-4,
 *              Chemical Class, Habit Forming, Therapeutic Class, Action Class
 *
 * Run: npm run import-1mg -- /path/to/medicine_dataset.csv
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { PrismaClient } from "@prisma/client";
import { normalizeMedicineName } from "../lib/utils";

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

interface CSVRow {
  id?: string;
  name?: string;
  [key: string]: string | undefined;
}

interface ProcessedMedicine {
  name: string;
  normalizedName: string;
  brandName: string | null;
  dosageForm: string | null;
  category: string | null;
  uses: string | null;
  sideEffects: string | null;
  description: string | null;
  isCatalog: boolean;
  soldOnline: boolean;
  prescriptionRequired: boolean;
}

const DOSAGE_FORMS = [
  "Injection", "Tablet", "Capsule", "Syrup", "Solution",
  "Suspension", "Cream", "Ointment", "Gel", "Drops",
  "Powder", "Inhaler", "Patch", "Spray", "Lotion",
  "Suppository", "Sachet", "Granules", "Kit", "Strip",
  "Infusion", "Implant", "Device", "Pen",
];

function extractDosageForm(name: string): string | null {
  const lower = name.toLowerCase();
  for (const form of DOSAGE_FORMS) {
    if (new RegExp(`\\b${form.toLowerCase()}\\b`).test(lower)) {
      return form;
    }
  }
  return null;
}

function extractBrandName(name: string): string | null {
  // Strip trailing strength/form/pack info to get brand only
  // "augmentin 625 duo tablet" → "Augmentin"
  // "crocin 650 tablet" → "Crocin"
  // "allegra-m tablet" → "Allegra-M"
  const cleaned = name
    .replace(/\s+\d+[\w./]*(\s*mg|\s*ml|\s*mcg|\s*iu|\s*g|\s*units?)?(\s+.*)?$/i, "")
    .replace(/\s+(tablet|capsule|syrup|injection|cream|gel|drops|inhaler|solution|suspension|ointment|spray|patch|lotion|powder|suppository|sachet|kit|strip|infusion|device|pen|pre-filled|filled)\b.*/i, "")
    .trim();
  if (!cleaned || cleaned === name.trim()) {
    // Fallback: just take the first word(s) before any number
    const match = name.match(/^([a-z][\w-]*(?:\s+[a-z][\w-]*)*?)(?:\s+\d|\s*$)/i);
    return match ? titleCase(match[1].trim()) : null;
  }
  return titleCase(cleaned);
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    // Preserve hyphenated brand suffixes: allegra-m → Allegra-M
    .replace(/-([a-z])/g, (_, c) => "-" + c.toUpperCase());
}

// Map Therapeutic Class values from dataset to clean category labels
const CATEGORY_MAP: Record<string, string> = {
  "ANTI INFECTIVES": "Anti-Infectives",
  "ANTI DIABETIC": "Diabetes",
  "CARDIAC": "Cardiac",
  "RESPIRATORY": "Respiratory",
  "GASTRO INTESTINAL": "Gastroenterology",
  "NEURO CNS": "Neurology",
  "DERMA": "Dermatology",
  "MUSCULO SKELETAL": "Musculoskeletal",
  "GYNAECOLOGICAL": "Gynaecology",
  "UROLOGY": "Urology",
  "OPTHALMOLOGICAL": "Ophthalmology",
  "ANTI CANCER": "Oncology",
  "VITAMINS MINERALS NUTRIENTS": "Vitamins & Supplements",
  "VACCINE": "Vaccines",
  "BLOOD RELATED": "Haematology",
  "HORMONES": "Hormones",
  "PSYCHOTROPIC": "Psychiatry",
  "PAIN ANALGESICS": "Pain & Fever",
  "ANAESTHETICS": "Anaesthetics",
  "ANTI PARASITIC": "Anti-Parasitic",
  "IMMUNOSUPPRESSANTS": "Immunology",
  "NUTRITION": "Nutrition",
  "DENTAL": "Dental",
  "ENT": "ENT",
};

function mapCategory(raw: string): string | null {
  if (!raw || raw === "NA") return null;
  const upper = raw.toUpperCase().trim();
  return CATEGORY_MAP[upper] ?? titleCase(raw.trim());
}

function processRow(row: CSVRow): ProcessedMedicine | null {
  const rawName = row.name?.trim();
  if (!rawName) return null;

  const name = titleCase(rawName);
  const normalizedName = normalizeMedicineName(name);
  if (!normalizedName) return null;

  // Collect side effects from wide columns (sideEffect0..41)
  const sideEffectArr: string[] = [];
  for (let i = 0; i <= 41; i++) {
    const v = row[`sideEffect${i}`]?.trim();
    if (v && v !== "NA" && v !== "") sideEffectArr.push(v);
  }

  // Collect uses from wide columns (use0..4)
  const useArr: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const v = row[`use${i}`]?.trim();
    if (v && v !== "NA" && v !== "") useArr.push(v);
  }

  const therapeuticClass = row["Therapeutic Class"]?.trim() ?? "";
  const actionClass = row["Action Class"]?.trim() ?? "";
  const chemicalClass = row["Chemical Class"]?.trim() ?? "";

  // Build description from chemical/action class info
  const descParts = [
    actionClass && actionClass !== "NA" ? `Drug class: ${actionClass}` : null,
    chemicalClass && chemicalClass !== "NA" ? `Chemical class: ${chemicalClass}` : null,
  ].filter(Boolean);

  return {
    name,
    normalizedName,
    brandName: extractBrandName(rawName),
    dosageForm: extractDosageForm(rawName),
    category: mapCategory(therapeuticClass),
    uses: useArr.length > 0 ? useArr.join("\n") : null,
    sideEffects: sideEffectArr.length > 0 ? sideEffectArr.join(", ") : null,
    description: descParts.length > 0 ? descParts.join(". ") : null,
    isCatalog: true,
    soldOnline: true,
    prescriptionRequired: false,
  };
}

async function loadExistingRecords(): Promise<
  Map<string, { id: string; uses: string | null; sideEffects: string | null; category: string | null; brandName: string | null; dosageForm: string | null; description: string | null }>
> {
  const records = await prisma.medicine.findMany({
    select: {
      id: true,
      normalizedName: true,
      uses: true,
      sideEffects: true,
      category: true,
      brandName: true,
      dosageForm: true,
      description: true,
    },
  });
  const map = new Map<string, typeof records[0]>();
  for (const r of records) map.set(r.normalizedName, r);
  return map;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts - 1 && (msg.includes("Can't reach") || msg.includes("P1001") || msg.includes("timeout"))) {
        const delay = 2000 * Math.pow(2, i);
        process.stdout.write(`\n⚠ DB connection issue, retrying in ${delay/1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

async function updateExistingRecord(
  id: string,
  existing: { uses: string | null; sideEffects: string | null; category: string | null; brandName: string | null; dosageForm: string | null; description: string | null },
  incoming: ProcessedMedicine
): Promise<void> {
  const updates: Record<string, string | null> = {};
  if (!existing.uses && incoming.uses) updates.uses = incoming.uses;
  if (!existing.sideEffects && incoming.sideEffects) updates.sideEffects = incoming.sideEffects;
  if (!existing.category && incoming.category) updates.category = incoming.category;
  if (!existing.brandName && incoming.brandName) updates.brandName = incoming.brandName;
  if (!existing.dosageForm && incoming.dosageForm) updates.dosageForm = incoming.dosageForm;
  if (!existing.description && incoming.description) updates.description = incoming.description;

  if (Object.keys(updates).length > 0) {
    await retryWithBackoff(() => prisma.medicine.update({ where: { id }, data: updates }));
  }
}

async function createBatch(batch: ProcessedMedicine[]): Promise<number> {
  const result = await retryWithBackoff(() => prisma.medicine.createMany({
    data: batch.map((m) => ({
      name: m.name,
      normalizedName: m.normalizedName,
      brandName: m.brandName,
      dosageForm: m.dosageForm,
      category: m.category,
      uses: m.uses,
      sideEffects: m.sideEffects,
      description: m.description,
      isCatalog: m.isCatalog,
      soldOnline: m.soldOnline,
      prescriptionRequired: m.prescriptionRequired,
    })),
    skipDuplicates: true,
  }));
  return result.count;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npm run import-1mg -- /path/to/medicine_dataset.csv");
    process.exit(1);
  }
  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`📋 Starting import from: ${resolvedPath}`);

  // Step 1: Read and deduplicate CSV in memory
  console.log("📖 Reading CSV...");
  const deduped = new Map<string, ProcessedMedicine>();
  let rawRowCount = 0;
  let skippedInvalid = 0;

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(resolvedPath)
      .pipe(csv())
      .on("data", (row: CSVRow) => {
        rawRowCount++;
        const med = processRow(row);
        if (!med) { skippedInvalid++; return; }
        const existing = deduped.get(med.normalizedName);
        if (!existing) {
          deduped.set(med.normalizedName, med);
        } else {
          // Keep the version with more fields populated
          const existingCount = [existing.uses, existing.sideEffects, existing.category].filter(Boolean).length;
          const incomingCount = [med.uses, med.sideEffects, med.category].filter(Boolean).length;
          if (incomingCount > existingCount) deduped.set(med.normalizedName, med);
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`📖 Read ${rawRowCount.toLocaleString()} rows`);
  console.log(`🚫 Skipped ${skippedInvalid.toLocaleString()} invalid rows`);
  console.log(`📦 ${deduped.size.toLocaleString()} unique medicines after in-CSV dedup`);

  // Step 2: Load existing DB records
  console.log("🔍 Loading existing database records...");
  const existingMap = await loadExistingRecords();
  console.log(`   Found ${existingMap.size.toLocaleString()} existing medicines in DB`);

  // Step 3: Split into new vs. existing
  const toCreate: ProcessedMedicine[] = [];
  const toUpdate: Array<{ id: string; existing: typeof existingMap extends Map<string, infer V> ? V : never; incoming: ProcessedMedicine }> = [];

  for (const [normName, med] of deduped) {
    const dbRecord = existingMap.get(normName);
    if (dbRecord) {
      toUpdate.push({ id: dbRecord.id, existing: dbRecord, incoming: med });
    } else {
      toCreate.push(med);
    }
  }

  console.log(`➕ ${toCreate.length.toLocaleString()} new medicines to insert`);
  console.log(`✏️  ${toUpdate.length.toLocaleString()} existing medicines to enrich`);

  // Step 4: Update existing records (fill null fields only) in chunks of 20
  if (toUpdate.length > 0) {
    console.log("✏️  Enriching existing records...");
    const CHUNK = 20;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK);
      await Promise.all(chunk.map(({ id, existing, incoming }) =>
        updateExistingRecord(id, existing, incoming)
      ));
      process.stdout.write(`\r   Enriched ${Math.min(i + CHUNK, toUpdate.length)}/${toUpdate.length} existing records`);
    }
    console.log(`\n   Done enriching existing records`);
  }

  // Step 5: Batch create new records
  let totalInserted = 0;
  let batchNum = 0;
  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    batchNum++;
    const inserted = await createBatch(batch);
    totalInserted += inserted;
    const progress = Math.min(i + BATCH_SIZE, toCreate.length);
    const pct = ((progress / toCreate.length) * 100).toFixed(1);
    process.stdout.write(`\r⏳ Progress: ${progress.toLocaleString()}/${toCreate.length.toLocaleString()} (${pct}%) — inserted ${totalInserted.toLocaleString()}`);
  }
  console.log();

  // Step 6: Final count
  const finalCount = await prisma.medicine.count();
  console.log(`\n✅ Import complete!`);
  console.log(`   New medicines inserted: ${totalInserted.toLocaleString()}`);
  console.log(`   Existing medicines enriched: ${toUpdate.length}`);
  console.log(`   Database total: ${finalCount.toLocaleString()} medicines`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
