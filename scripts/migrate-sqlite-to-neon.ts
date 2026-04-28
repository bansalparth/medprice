/**
 * One-shot data migration from local SQLite (`prisma/dev.db.backup`) to the
 * Postgres database currently configured via DATABASE_URL (Neon).
 *
 * Run AFTER `prisma migrate dev` has applied the schema to Postgres.
 *
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-neon.ts
 */
import "dotenv/config";
import path from "path";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH = path.resolve(process.cwd(), "prisma/dev.db.backup");
const BATCH_SIZE = 500;

const prisma = new PrismaClient();
const sqlite = new Database(SQLITE_PATH, { readonly: true });

interface TableSpec {
  name: string;
  prismaModel: keyof Omit<PrismaClient, `$${string}`>;
  selectSql: string;
  transform?: (row: any) => any;
}

const TABLES: TableSpec[] = [
  {
    name: "Medicine",
    prismaModel: "medicine",
    selectSql: "SELECT * FROM Medicine",
  },
  {
    name: "JanAushadhiProduct",
    prismaModel: "janAushadhiProduct",
    selectSql: "SELECT * FROM JanAushadhiProduct",
  },
  {
    name: "JanAushadhiStore",
    prismaModel: "janAushadhiStore",
    selectSql: "SELECT * FROM JanAushadhiStore",
  },
  {
    name: "PharmacyListing",
    prismaModel: "pharmacyListing",
    selectSql: "SELECT * FROM PharmacyListing",
  },
  {
    name: "SaltMapping",
    prismaModel: "saltMapping",
    selectSql: "SELECT * FROM SaltMapping",
  },
  {
    name: "SearchLog",
    prismaModel: "searchLog",
    selectSql: "SELECT * FROM SearchLog",
  },
  {
    name: "ClickLog",
    prismaModel: "clickLog",
    selectSql: "SELECT * FROM ClickLog",
  },
  {
    name: "PriceHistory",
    prismaModel: "priceHistory",
    selectSql: "SELECT * FROM PriceHistory",
  },
  {
    name: "ScrapeJob",
    prismaModel: "scrapeJob",
    selectSql: "SELECT * FROM ScrapeJob",
  },
];

// Columns Prisma expects to be DateTime. SQLite stores them as either
// epoch-millisecond integers (when written by Prisma's sqlite client) or
// ISO strings (when written manually).
const DATE_COLS = new Set([
  "createdAt",
  "updatedAt",
  "scrapedAt",
  "startedAt",
  "completedAt",
  "recordedAt",
]);

const BOOL_COLS = new Set([
  "inStock",
  "isCatalog",
  "prescriptionRequired",
  "soldOnline",
  "janAushadhiMatch",
]);

function normalize(row: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    if (BOOL_COLS.has(k)) {
      out[k] = v === 1 || v === "1" || v === true;
      continue;
    }
    if (DATE_COLS.has(k)) {
      if (typeof v === "number") out[k] = new Date(v);
      else if (typeof v === "string") out[k] = new Date(v);
      else out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function migrateTable(spec: TableSpec, fkValidator?: (row: any) => boolean) {
  const rows = sqlite.prepare(spec.selectSql).all() as any[];
  if (rows.length === 0) {
    console.log(`  ${spec.name}: 0 rows, skipping`);
    return;
  }

  let normalized = rows.map(normalize).map(spec.transform ?? ((r) => r));
  const beforeFilter = normalized.length;
  if (fkValidator) {
    normalized = normalized.filter(fkValidator);
  }
  const dropped = beforeFilter - normalized.length;

  let inserted = 0;
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    const result = await (prisma[spec.prismaModel] as any).createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;
  }
  const droppedNote = dropped > 0 ? ` (${dropped} dropped: orphaned FK)` : "";
  console.log(`  ${spec.name}: ${inserted}/${rows.length} inserted${droppedNote}`);
}

async function main() {
  console.log(`📦 Migrating from ${SQLITE_PATH} to Neon Postgres\n`);

  // Pre-load valid FK target IDs for orphan filtering
  const validMedicineIds = new Set(
    (sqlite.prepare("SELECT id FROM Medicine").all() as { id: string }[]).map(
      (r) => r.id
    )
  );
  const validJanProductIds = new Set(
    (sqlite.prepare("SELECT id FROM JanAushadhiProduct").all() as { id: string }[]).map(
      (r) => r.id
    )
  );

  const validators: Record<string, (row: any) => boolean> = {
    PharmacyListing: (r) => validMedicineIds.has(r.medicineId),
    SaltMapping: (r) =>
      validMedicineIds.has(r.medicineId) &&
      validJanProductIds.has(r.janAushadhiProductId),
    SearchLog: (r) => !r.medicineId || validMedicineIds.has(r.medicineId),
    ClickLog: (r) => validMedicineIds.has(r.medicineId),
    PriceHistory: (r) => validMedicineIds.has(r.medicineId),
  };

  for (const spec of TABLES) {
    await migrateTable(spec, validators[spec.name]);
  }

  console.log(`\n✅ Migration complete!`);

  // Verify
  const counts = await Promise.all([
    prisma.medicine.count(),
    prisma.pharmacyListing.count(),
    prisma.janAushadhiProduct.count(),
    prisma.janAushadhiStore.count(),
    prisma.saltMapping.count(),
    prisma.searchLog.count(),
    prisma.clickLog.count(),
    prisma.priceHistory.count(),
  ]);
  console.log(`\n📊 Neon row counts:`);
  console.log(`   Medicine: ${counts[0]}`);
  console.log(`   PharmacyListing: ${counts[1]}`);
  console.log(`   JanAushadhiProduct: ${counts[2]}`);
  console.log(`   JanAushadhiStore: ${counts[3]}`);
  console.log(`   SaltMapping: ${counts[4]}`);
  console.log(`   SearchLog: ${counts[5]}`);
  console.log(`   ClickLog: ${counts[6]}`);
  console.log(`   PriceHistory: ${counts[7]}`);

  await prisma.$disconnect();
  sqlite.close();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  sqlite.close();
  process.exit(1);
});
