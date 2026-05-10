import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

interface StoreEntry {
  kendraId: string;
  state: string | null;
  district: string | null;
  block: string | null;
  address: string | null;
  pincode: string | null;
  contactPerson: string | null;
  contactDetails: string | null;
}

async function main() {
  const dataPath = join(__dirname, "data", "jan-aushadhi-stores.json");
  const raw = readFileSync(dataPath, "utf-8");
  const stores: StoreEntry[] = JSON.parse(raw);

  console.log(`Seeding ${stores.length} Jan Aushadhi stores...`);

  const BATCH_SIZE = 100;
  let upserted = 0;

  for (let i = 0; i < stores.length; i += BATCH_SIZE) {
    const batch = stores.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((store) =>
        prisma.janAushadhiStore.upsert({
          where: { kendraId: store.kendraId },
          update: {
            state: store.state,
            district: store.district,
            block: store.block,
            address: store.address,
            pincode: store.pincode,
            contactPerson: store.contactPerson,
            contactDetails: store.contactDetails,
          },
          create: {
            kendraId: store.kendraId,
            state: store.state,
            district: store.district,
            block: store.block,
            address: store.address,
            pincode: store.pincode,
            contactPerson: store.contactPerson,
            contactDetails: store.contactDetails,
          },
        })
      )
    );
    upserted += batch.length;
    if (upserted % 500 === 0 || upserted === stores.length) {
      console.log(`  ${upserted}/${stores.length} stores upserted`);
    }
  }

  console.log(`✅ Store seed complete. ${upserted} stores loaded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
