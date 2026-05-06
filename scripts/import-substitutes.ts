/**
 * Imports substitute/alternative data from the 1mg CSV into the Medicine.substitutes field.
 *
 * CSV columns used: name, substitute0-4
 *
 * Run: npm run import-substitutes
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { PrismaClient } from "@prisma/client";
import { normalizeMedicineName } from "../lib/utils";

const prisma = new PrismaClient();

interface CSVRow {
  name?: string;
  [key: string]: string | undefined;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .replace(/-([a-z])/g, (_, c: string) => "-" + c.toUpperCase());
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        i < attempts - 1 &&
        (msg.includes("Can't reach") || msg.includes("P1001"))
      ) {
        const delay = 2000 * Math.pow(2, i);
        console.log(`  ⏳ DB connection error, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

async function main() {
  const csvPath =
    process.argv[2] ??
    path.join(process.env.HOME ?? "~", "Downloads", "medicine_dataset.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`📂 Reading CSV: ${csvPath}`);

  // Phase 1: Parse CSV and collect substitutes per normalized name
  const substitutesMap = new Map<string, string[]>();
  let totalRows = 0;
  let rowsWithSubs = 0;

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row: CSVRow) => {
        totalRows++;
        const rawName = row.name?.trim();
        if (!rawName) return;

        const name = titleCase(rawName);
        const normalizedName = normalizeMedicineName(name);
        if (!normalizedName) return;

        // Collect substitute0..4
        const subs: string[] = [];
        for (let i = 0; i <= 4; i++) {
          const v = row[`substitute${i}`]?.trim();
          if (v && v !== "NA" && v !== "") subs.push(v);
        }

        if (subs.length > 0) {
          rowsWithSubs++;
          substitutesMap.set(normalizedName, subs);
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(
    `✅ Parsed ${totalRows} rows, ${rowsWithSubs} have substitutes (${substitutesMap.size} unique)`,
  );

  // Phase 2: Batch update medicines with substitutes
  const entries = Array.from(substitutesMap.entries());
  const BATCH = 50;
  let updated = 0;
  let notFound = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);

    const results = await Promise.allSettled(
      batch.map(async ([normalizedName, subs]) => {
        const existing = await retryWithBackoff(() =>
          prisma.medicine.findUnique({
            where: { normalizedName },
            select: { id: true, substitutes: true },
          }),
        );

        if (!existing) {
          notFound++;
          return false;
        }

        // Skip if already has substitutes
        if (existing.substitutes) return false;

        await retryWithBackoff(() =>
          prisma.medicine.update({
            where: { id: existing.id },
            data: { substitutes: JSON.stringify(subs) },
          }),
        );
        return true;
      }),
    );

    const batchUpdated = results.filter(
      (r) => r.status === "fulfilled" && r.value === true,
    ).length;
    updated += batchUpdated;

    if ((i / BATCH) % 20 === 0) {
      console.log(
        `  📦 ${i + batch.length}/${entries.length} processed, ${updated} updated, ${notFound} not found`,
      );
    }
  }

  console.log(`\n🏁 Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Not found in DB: ${notFound}`);
  console.log(`   Skipped (already had substitutes): ${rowsWithSubs - updated - notFound}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
