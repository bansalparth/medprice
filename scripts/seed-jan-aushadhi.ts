import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import pdfParse from "pdf-parse";
import fs from "fs";
import path from "path";
import https from "https";

const prisma = new PrismaClient();

const PDF_URL = "https://janaushadhi.gov.in/Data/PMBJP%20Product.pdf";

async function downloadPdf(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadPdf(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });
    req.on("error", reject);
  });
}

// Fallback seed: hand-curated common generics if PDF fails
const FALLBACK_SEED = [
  { drugCode: "JA0001", genericName: "Paracetamol 500mg Tablet", saltComposition: "Paracetamol", unitSize: "10 Tablets", mrpBppi: 4.05 },
  { drugCode: "JA0002", genericName: "Metformin 500mg Tablet", saltComposition: "Metformin", unitSize: "10 Tablets", mrpBppi: 5.10 },
  { drugCode: "JA0003", genericName: "Atorvastatin 10mg Tablet", saltComposition: "Atorvastatin", unitSize: "10 Tablets", mrpBppi: 14.5 },
  { drugCode: "JA0004", genericName: "Cetirizine 10mg Tablet", saltComposition: "Cetirizine", unitSize: "10 Tablets", mrpBppi: 5.5 },
  { drugCode: "JA0005", genericName: "Pantoprazole 40mg Tablet", saltComposition: "Pantoprazole", unitSize: "10 Tablets", mrpBppi: 12.0 },
  { drugCode: "JA0006", genericName: "Amoxicillin 500mg Capsule", saltComposition: "Amoxicillin", unitSize: "10 Capsules", mrpBppi: 30.0 },
  { drugCode: "JA0007", genericName: "Azithromycin 500mg Tablet", saltComposition: "Azithromycin", unitSize: "3 Tablets", mrpBppi: 15.0 },
  { drugCode: "JA0008", genericName: "Amlodipine 5mg Tablet", saltComposition: "Amlodipine", unitSize: "10 Tablets", mrpBppi: 5.0 },
  { drugCode: "JA0009", genericName: "Telmisartan 40mg Tablet", saltComposition: "Telmisartan", unitSize: "10 Tablets", mrpBppi: 15.0 },
  { drugCode: "JA0010", genericName: "Losartan 50mg Tablet", saltComposition: "Losartan", unitSize: "10 Tablets", mrpBppi: 8.0 },
  { drugCode: "JA0011", genericName: "Glimepiride 2mg Tablet", saltComposition: "Glimepiride", unitSize: "10 Tablets", mrpBppi: 10.0 },
  { drugCode: "JA0012", genericName: "Levothyroxine 50mcg Tablet", saltComposition: "Levothyroxine Sodium", unitSize: "10 Tablets", mrpBppi: 8.0 },
  { drugCode: "JA0013", genericName: "Ibuprofen 400mg Tablet", saltComposition: "Ibuprofen", unitSize: "10 Tablets", mrpBppi: 7.5 },
  { drugCode: "JA0014", genericName: "Diclofenac 50mg Tablet", saltComposition: "Diclofenac Sodium", unitSize: "10 Tablets", mrpBppi: 5.0 },
  { drugCode: "JA0015", genericName: "Omeprazole 20mg Capsule", saltComposition: "Omeprazole", unitSize: "10 Capsules", mrpBppi: 8.0 },
  { drugCode: "JA0016", genericName: "Ranitidine 150mg Tablet", saltComposition: "Ranitidine", unitSize: "10 Tablets", mrpBppi: 6.0 },
  { drugCode: "JA0017", genericName: "Aspirin 75mg Tablet", saltComposition: "Aspirin", unitSize: "14 Tablets", mrpBppi: 4.5 },
  { drugCode: "JA0018", genericName: "Clopidogrel 75mg Tablet", saltComposition: "Clopidogrel", unitSize: "10 Tablets", mrpBppi: 18.0 },
  { drugCode: "JA0019", genericName: "Rosuvastatin 10mg Tablet", saltComposition: "Rosuvastatin", unitSize: "10 Tablets", mrpBppi: 22.0 },
  { drugCode: "JA0020", genericName: "Sitagliptin 100mg Tablet", saltComposition: "Sitagliptin", unitSize: "10 Tablets", mrpBppi: 50.0 },
  { drugCode: "JA0021", genericName: "Montelukast 10mg Tablet", saltComposition: "Montelukast", unitSize: "10 Tablets", mrpBppi: 25.0 },
  { drugCode: "JA0022", genericName: "Levocetirizine 5mg Tablet", saltComposition: "Levocetirizine", unitSize: "10 Tablets", mrpBppi: 8.0 },
  { drugCode: "JA0023", genericName: "Domperidone 10mg Tablet", saltComposition: "Domperidone", unitSize: "10 Tablets", mrpBppi: 6.0 },
  { drugCode: "JA0024", genericName: "Ondansetron 4mg Tablet", saltComposition: "Ondansetron", unitSize: "10 Tablets", mrpBppi: 12.0 },
  { drugCode: "JA0025", genericName: "Ciprofloxacin 500mg Tablet", saltComposition: "Ciprofloxacin", unitSize: "10 Tablets", mrpBppi: 18.0 },
];

async function main() {
  const pdfPath = path.join(process.cwd(), "tmp-pmbjp.pdf");
  let products: typeof FALLBACK_SEED = [];

  try {
    console.log("Downloading PMBJP product list PDF...");
    await downloadPdf(PDF_URL, pdfPath);
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);

    const lines = pdfData.text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(.+?)\s+([\d.]+[a-zA-Z\/ml.]+)\s+([\d.]+)\s*$/);
      if (match) {
        products.push({
          drugCode: match[1].trim(),
          genericName: match[2].trim(),
          saltComposition: match[2].trim(),
          unitSize: match[3].trim(),
          mrpBppi: parseFloat(match[4]),
        });
      }
    }

    fs.unlinkSync(pdfPath);
    console.log(`Parsed ${products.length} products from PDF.`);
  } catch (err) {
    console.warn("PDF download/parse failed, using fallback seed list:", (err as Error).message);
  }

  if (products.length === 0) {
    console.log(`Using fallback seed (${FALLBACK_SEED.length} products).`);
    products = FALLBACK_SEED;
  }

  console.log("Inserting...");
  for (const product of products) {
    await prisma.janAushadhiProduct.upsert({
      where: { drugCode: product.drugCode },
      update: product,
      create: product,
    });
  }

  console.log(`✅ Jan Aushadhi product seed complete (${products.length} products).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
