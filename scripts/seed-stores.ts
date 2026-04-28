import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_STORES = [
  { kendraId: "PMBJK00001", state: "Andhra Pradesh", district: "Visakhapatnam", address: "Government Hospital, Beach Road, Visakhapatnam, AP 530002" },
  { kendraId: "PMBJK00002", state: "Andhra Pradesh", district: "Vijayawada", address: "Government General Hospital, Eluru Road, Vijayawada, AP 520002" },
  { kendraId: "PMBJK00003", state: "Andhra Pradesh", district: "Guntur", address: "GGH Guntur, Collector Office Road, Guntur, AP 522001" },
  { kendraId: "PMBJK00004", state: "Karnataka", district: "Bengaluru", address: "Rajiv Gandhi Government Hospital, Jayanagar, Bengaluru, KA 560041" },
  { kendraId: "PMBJK00005", state: "Karnataka", district: "Bengaluru", address: "Victoria Hospital, K R Market, Bengaluru, KA 560002" },
  { kendraId: "PMBJK00006", state: "Karnataka", district: "Mysuru", address: "K R Hospital, Irwin Road, Mysuru, KA 570001" },
  { kendraId: "PMBJK00007", state: "Maharashtra", district: "Mumbai", address: "KEM Hospital, Parel, Mumbai, MH 400012" },
  { kendraId: "PMBJK00008", state: "Maharashtra", district: "Mumbai", address: "Nair Hospital, Dr A L Nair Road, Mumbai Central, Mumbai, MH 400008" },
  { kendraId: "PMBJK00009", state: "Maharashtra", district: "Pune", address: "Sassoon General Hospital, Pune Station Road, Pune, MH 411001" },
  { kendraId: "PMBJK00010", state: "Tamil Nadu", district: "Chennai", address: "Rajiv Gandhi Government Hospital, Park Town, Chennai, TN 600003" },
  { kendraId: "PMBJK00011", state: "Tamil Nadu", district: "Coimbatore", address: "Coimbatore Medical College Hospital, Trichy Road, Coimbatore, TN 641014" },
  { kendraId: "PMBJK00012", state: "Delhi", district: "New Delhi", address: "Safdarjung Hospital, Sri Aurobindo Marg, New Delhi, DL 110029" },
  { kendraId: "PMBJK00013", state: "Delhi", district: "New Delhi", address: "AIIMS Jan Aushadhi Kendra, Ansari Nagar, New Delhi, DL 110029" },
  { kendraId: "PMBJK00014", state: "Delhi", district: "New Delhi", address: "GTB Hospital, Dilshad Garden, New Delhi, DL 110095" },
  { kendraId: "PMBJK00015", state: "Uttar Pradesh", district: "Lucknow", address: "KGMU Campus, Shah Mina Road, Lucknow, UP 226003" },
  { kendraId: "PMBJK00016", state: "Uttar Pradesh", district: "Varanasi", address: "BHU Hospital, Lanka, Varanasi, UP 221005" },
  { kendraId: "PMBJK00017", state: "Rajasthan", district: "Jaipur", address: "SMS Hospital, JLN Marg, Jaipur, RJ 302004" },
  { kendraId: "PMBJK00018", state: "Gujarat", district: "Ahmedabad", address: "Civil Hospital, Asarwa, Ahmedabad, GJ 380016" },
  { kendraId: "PMBJK00019", state: "West Bengal", district: "Kolkata", address: "SSKM Hospital, AJC Bose Road, Kolkata, WB 700020" },
  { kendraId: "PMBJK00020", state: "Telangana", district: "Hyderabad", address: "Osmania General Hospital, Afzalgunj, Hyderabad, TS 500012" },
];

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  await new Promise((r) => setTimeout(r, 1100));
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    address
  )}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MedPrice/1.0 (medicine price comparison India)" },
    });
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.warn(`Geocoding failed for: ${address}`, (err as Error).message);
  }
  return null;
}

async function main() {
  console.log(`Seeding ${SEED_STORES.length} Jan Aushadhi stores...`);
  let geocoded = 0;
  for (const store of SEED_STORES) {
    console.log(`Geocoding: ${store.kendraId} - ${store.district}, ${store.state}`);
    const coords = await geocodeAddress(store.address);
    if (coords) geocoded++;

    await prisma.janAushadhiStore.upsert({
      where: { kendraId: store.kendraId },
      update: { ...store, lat: coords?.lat, lng: coords?.lng },
      create: { ...store, lat: coords?.lat, lng: coords?.lng },
    });
  }

  console.log(`✅ Store seed complete. ${geocoded}/${SEED_STORES.length} geocoded.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
