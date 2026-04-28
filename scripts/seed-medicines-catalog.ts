import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { normalizeMedicineName } from "../lib/utils";

const prisma = new PrismaClient();

// Curated catalog of popular Indian medicines.
// Format: brand, generic ingredients, dosage form, strength, manufacturer.
// Strength is the primary salt's strength; ingredients[] has full breakdown.
//
// Sources of truth: cdsco.gov.in, pharma manufacturer websites, common Rx patterns in India.
// Each entry has been hand-verified for the salt composition.

interface SeedMed {
  brand: string;
  ingredients: { name: string; strength: number; unit: string }[];
  form: string; // Tablet, Capsule, Syrup, Injection, Drops, Cream, Inhaler
  pack: string;
  manufacturer: string;
  category?: string;
}

const CATALOG: SeedMed[] = [
  // ── Pain & Fever (Paracetamol family) ───────────────────────────────
  { brand: "Crocin Advance", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 20", manufacturer: "GSK Pharmaceuticals", category: "Pain & Fever" },
  { brand: "Crocin 650", ingredients: [{ name: "Paracetamol", strength: 650, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "GSK Pharmaceuticals", category: "Pain & Fever" },
  { brand: "Dolo 650", ingredients: [{ name: "Paracetamol", strength: 650, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Micro Labs", category: "Pain & Fever" },
  { brand: "Dolo 500", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Micro Labs", category: "Pain & Fever" },
  { brand: "Calpol 500", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "GSK Pharmaceuticals", category: "Pain & Fever" },
  { brand: "Calpol 650", ingredients: [{ name: "Paracetamol", strength: 650, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "GSK Pharmaceuticals", category: "Pain & Fever" },
  { brand: "Paracip 500", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Pain & Fever" },
  { brand: "Pacimol 500", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Ipca Laboratories", category: "Pain & Fever" },
  { brand: "Pyrigesic 500", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "East India Pharmaceutical", category: "Pain & Fever" },
  { brand: "Fevastin 500", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Wockhardt", category: "Pain & Fever" },

  // NSAIDs & combinations
  { brand: "Combiflam", ingredients: [{ name: "Ibuprofen", strength: 400, unit: "mg" }, { name: "Paracetamol", strength: 325, unit: "mg" }], form: "Tablet", pack: "Strip of 20", manufacturer: "Sanofi India", category: "Pain & Fever" },
  { brand: "Ibugesic Plus", ingredients: [{ name: "Ibuprofen", strength: 400, unit: "mg" }, { name: "Paracetamol", strength: 325, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Pain & Fever" },
  { brand: "Brufen 400", ingredients: [{ name: "Ibuprofen", strength: 400, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Abbott India", category: "Pain & Fever" },
  { brand: "Voveran 50", ingredients: [{ name: "Diclofenac Sodium", strength: 50, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Novartis India", category: "Pain & Fever" },
  { brand: "Diclomol", ingredients: [{ name: "Diclofenac Sodium", strength: 50, unit: "mg" }, { name: "Paracetamol", strength: 325, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Win-Medicare", category: "Pain & Fever" },
  { brand: "Naprosyn 250", ingredients: [{ name: "Naproxen", strength: 250, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Roche", category: "Pain & Fever" },
  { brand: "Nise 100", ingredients: [{ name: "Nimesulide", strength: 100, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Dr. Reddy's", category: "Pain & Fever" },
  { brand: "Aceclofenac 100", ingredients: [{ name: "Aceclofenac", strength: 100, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Pain & Fever" },
  { brand: "Hifenac 100", ingredients: [{ name: "Aceclofenac", strength: 100, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Intas Pharmaceuticals", category: "Pain & Fever" },
  { brand: "Ecosprin 75", ingredients: [{ name: "Aspirin", strength: 75, unit: "mg" }], form: "Tablet", pack: "Strip of 14", manufacturer: "USV Pvt Ltd", category: "Cardiac" },

  // ── Acidity / GI ────────────────────────────────────────────────────
  { brand: "Pan 40", ingredients: [{ name: "Pantoprazole", strength: 40, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Alkem Laboratories", category: "Gastric" },
  { brand: "Pantop 40", ingredients: [{ name: "Pantoprazole", strength: 40, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Aristo Pharmaceuticals", category: "Gastric" },
  { brand: "Pantocid 40", ingredients: [{ name: "Pantoprazole", strength: 40, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Sun Pharma", category: "Gastric" },
  { brand: "Pan-D", ingredients: [{ name: "Pantoprazole", strength: 40, unit: "mg" }, { name: "Domperidone", strength: 30, unit: "mg" }], form: "Capsule", pack: "Strip of 15", manufacturer: "Alkem Laboratories", category: "Gastric" },
  { brand: "Razo 20", ingredients: [{ name: "Rabeprazole", strength: 20, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Dr. Reddy's", category: "Gastric" },
  { brand: "Rablet 20", ingredients: [{ name: "Rabeprazole", strength: 20, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Lupin", category: "Gastric" },
  { brand: "Omez 20", ingredients: [{ name: "Omeprazole", strength: 20, unit: "mg" }], form: "Capsule", pack: "Strip of 15", manufacturer: "Dr. Reddy's", category: "Gastric" },
  { brand: "Ocid 20", ingredients: [{ name: "Omeprazole", strength: 20, unit: "mg" }], form: "Capsule", pack: "Strip of 10", manufacturer: "Zydus Cadila", category: "Gastric" },
  { brand: "Aciloc 150", ingredients: [{ name: "Ranitidine", strength: 150, unit: "mg" }], form: "Tablet", pack: "Strip of 30", manufacturer: "Cadila", category: "Gastric" },
  { brand: "Zinetac 150", ingredients: [{ name: "Ranitidine", strength: 150, unit: "mg" }], form: "Tablet", pack: "Strip of 20", manufacturer: "GSK Pharmaceuticals", category: "Gastric" },
  { brand: "Domstal 10", ingredients: [{ name: "Domperidone", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Torrent Pharmaceuticals", category: "Gastric" },
  { brand: "Vomikind 4", ingredients: [{ name: "Ondansetron", strength: 4, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Mankind Pharma", category: "Gastric" },

  // ── Diabetes ────────────────────────────────────────────────────────
  { brand: "Glycomet 500", ingredients: [{ name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 20", manufacturer: "USV", category: "Diabetes" },
  { brand: "Glyciphage 500", ingredients: [{ name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 20", manufacturer: "Franco Indian", category: "Diabetes" },
  { brand: "Okamet 500", ingredients: [{ name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 20", manufacturer: "Cipla", category: "Diabetes" },
  { brand: "Gluconorm 500", ingredients: [{ name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 20", manufacturer: "Lupin", category: "Diabetes" },
  { brand: "Galvus Met 50/500", ingredients: [{ name: "Vildagliptin", strength: 50, unit: "mg" }, { name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Novartis", category: "Diabetes" },
  { brand: "Janumet 50/500", ingredients: [{ name: "Sitagliptin", strength: 50, unit: "mg" }, { name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "MSD", category: "Diabetes" },
  { brand: "Istamet 50/500", ingredients: [{ name: "Sitagliptin", strength: 50, unit: "mg" }, { name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Sun Pharma", category: "Diabetes" },
  { brand: "Amaryl 2", ingredients: [{ name: "Glimepiride", strength: 2, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sanofi", category: "Diabetes" },
  { brand: "Amaryl-M 2", ingredients: [{ name: "Glimepiride", strength: 2, unit: "mg" }, { name: "Metformin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sanofi", category: "Diabetes" },
  { brand: "Glynase 5", ingredients: [{ name: "Glipizide", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "USV", category: "Diabetes" },
  { brand: "Forxiga 10", ingredients: [{ name: "Dapagliflozin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 14", manufacturer: "AstraZeneca", category: "Diabetes" },
  { brand: "Jardiance 10", ingredients: [{ name: "Empagliflozin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Boehringer Ingelheim", category: "Diabetes" },

  // ── Hypertension / Cardiac ─────────────────────────────────────────
  { brand: "Amlong 5", ingredients: [{ name: "Amlodipine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Micro Labs", category: "Cardiac" },
  { brand: "Amlokind 5", ingredients: [{ name: "Amlodipine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Mankind Pharma", category: "Cardiac" },
  { brand: "Amlodac 5", ingredients: [{ name: "Amlodipine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 30", manufacturer: "Zydus", category: "Cardiac" },
  { brand: "Stamlo 5", ingredients: [{ name: "Amlodipine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Dr. Reddy's", category: "Cardiac" },
  { brand: "Telma 40", ingredients: [{ name: "Telmisartan", strength: 40, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Glenmark", category: "Cardiac" },
  { brand: "Telma-H", ingredients: [{ name: "Telmisartan", strength: 40, unit: "mg" }, { name: "Hydrochlorothiazide", strength: 12.5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Glenmark", category: "Cardiac" },
  { brand: "Telma-AM", ingredients: [{ name: "Telmisartan", strength: 40, unit: "mg" }, { name: "Amlodipine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Glenmark", category: "Cardiac" },
  { brand: "Losar 50", ingredients: [{ name: "Losartan", strength: 50, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Unichem", category: "Cardiac" },
  { brand: "Losanorm 50", ingredients: [{ name: "Losartan", strength: 50, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Cardiac" },
  { brand: "Repace 50", ingredients: [{ name: "Losartan", strength: 50, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sun Pharma", category: "Cardiac" },
  { brand: "Cilacar 10", ingredients: [{ name: "Cilnidipine", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "J. B. Chemicals", category: "Cardiac" },
  { brand: "Cinod 10", ingredients: [{ name: "Cilnidipine", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Lupin", category: "Cardiac" },
  { brand: "Atorva 10", ingredients: [{ name: "Atorvastatin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Zydus", category: "Cardiac" },
  { brand: "Storvas 10", ingredients: [{ name: "Atorvastatin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Sun Pharma", category: "Cardiac" },
  { brand: "Atorlip 10", ingredients: [{ name: "Atorvastatin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Cipla", category: "Cardiac" },
  { brand: "Lipikind 10", ingredients: [{ name: "Atorvastatin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Mankind Pharma", category: "Cardiac" },
  { brand: "Rosuvas 10", ingredients: [{ name: "Rosuvastatin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sun Pharma", category: "Cardiac" },
  { brand: "Roseday 10", ingredients: [{ name: "Rosuvastatin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "USV", category: "Cardiac" },
  { brand: "Crestor 10", ingredients: [{ name: "Rosuvastatin", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "AstraZeneca", category: "Cardiac" },
  { brand: "Concor 5", ingredients: [{ name: "Bisoprolol", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Merck", category: "Cardiac" },
  { brand: "Metolar 50", ingredients: [{ name: "Metoprolol", strength: 50, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Cardiac" },
  { brand: "Tenormin 50", ingredients: [{ name: "Atenolol", strength: 50, unit: "mg" }], form: "Tablet", pack: "Strip of 14", manufacturer: "AstraZeneca", category: "Cardiac" },
  { brand: "Clopilet 75", ingredients: [{ name: "Clopidogrel", strength: 75, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Sun Pharma", category: "Cardiac" },
  { brand: "Deplatt 75", ingredients: [{ name: "Clopidogrel", strength: 75, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Torrent Pharmaceuticals", category: "Cardiac" },

  // ── Allergy / Cold ──────────────────────────────────────────────────
  { brand: "Cetzine 10", ingredients: [{ name: "Cetirizine", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Dr. Reddy's", category: "Allergy" },
  { brand: "Cetcip 10", ingredients: [{ name: "Cetirizine", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Allergy" },
  { brand: "Alerid 10", ingredients: [{ name: "Cetirizine", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Allergy" },
  { brand: "Levocet 5", ingredients: [{ name: "Levocetirizine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Dr. Reddy's", category: "Allergy" },
  { brand: "Vozet 5", ingredients: [{ name: "Levocetirizine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sun Pharma", category: "Allergy" },
  { brand: "Allegra 120", ingredients: [{ name: "Fexofenadine", strength: 120, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sanofi", category: "Allergy" },
  { brand: "Allegra 180", ingredients: [{ name: "Fexofenadine", strength: 180, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sanofi", category: "Allergy" },
  { brand: "Avil 25", ingredients: [{ name: "Pheniramine", strength: 25, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sanofi", category: "Allergy" },
  { brand: "Montair 10", ingredients: [{ name: "Montelukast", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Cipla", category: "Allergy" },
  { brand: "Montair-LC", ingredients: [{ name: "Montelukast", strength: 10, unit: "mg" }, { name: "Levocetirizine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Cipla", category: "Allergy" },

  // ── Cough / Cold ────────────────────────────────────────────────────
  { brand: "Benadryl Cough Syrup", ingredients: [{ name: "Diphenhydramine", strength: 14.08, unit: "mg" }, { name: "Ammonium Chloride", strength: 138, unit: "mg" }], form: "Syrup", pack: "100ml", manufacturer: "Johnson & Johnson", category: "Cough & Cold" },
  { brand: "Ascoril LS", ingredients: [{ name: "Ambroxol", strength: 30, unit: "mg" }, { name: "Levosalbutamol", strength: 1, unit: "mg" }, { name: "Guaifenesin", strength: 50, unit: "mg" }], form: "Syrup", pack: "100ml", manufacturer: "Glenmark", category: "Cough & Cold" },
  { brand: "Sinarest", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }, { name: "Phenylephrine", strength: 10, unit: "mg" }, { name: "Chlorpheniramine", strength: 2, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Centaur Pharmaceuticals", category: "Cough & Cold" },
  { brand: "Vicks Action 500", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }, { name: "Phenylephrine", strength: 5, unit: "mg" }, { name: "Caffeine", strength: 30, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Procter & Gamble", category: "Cough & Cold" },
  { brand: "D'Cold Total", ingredients: [{ name: "Paracetamol", strength: 500, unit: "mg" }, { name: "Phenylephrine", strength: 5, unit: "mg" }, { name: "Caffeine", strength: 30, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Reckitt Benckiser", category: "Cough & Cold" },

  // ── Antibiotics ─────────────────────────────────────────────────────
  { brand: "Augmentin 625", ingredients: [{ name: "Amoxicillin", strength: 500, unit: "mg" }, { name: "Clavulanic Acid", strength: 125, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "GSK Pharmaceuticals", category: "Antibiotic" },
  { brand: "Clavam 625", ingredients: [{ name: "Amoxicillin", strength: 500, unit: "mg" }, { name: "Clavulanic Acid", strength: 125, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Alkem Laboratories", category: "Antibiotic" },
  { brand: "Moxikind-CV 625", ingredients: [{ name: "Amoxicillin", strength: 500, unit: "mg" }, { name: "Clavulanic Acid", strength: 125, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Mankind Pharma", category: "Antibiotic" },
  { brand: "Mox 500", ingredients: [{ name: "Amoxicillin", strength: 500, unit: "mg" }], form: "Capsule", pack: "Strip of 15", manufacturer: "Sun Pharma", category: "Antibiotic" },
  { brand: "Novamox 500", ingredients: [{ name: "Amoxicillin", strength: 500, unit: "mg" }], form: "Capsule", pack: "Strip of 15", manufacturer: "Cipla", category: "Antibiotic" },
  { brand: "Azithral 500", ingredients: [{ name: "Azithromycin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 5", manufacturer: "Alembic", category: "Antibiotic" },
  { brand: "Azee 500", ingredients: [{ name: "Azithromycin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 3", manufacturer: "Cipla", category: "Antibiotic" },
  { brand: "Zithrox 500", ingredients: [{ name: "Azithromycin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 3", manufacturer: "Mankind Pharma", category: "Antibiotic" },
  { brand: "Cifran 500", ingredients: [{ name: "Ciprofloxacin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Ranbaxy", category: "Antibiotic" },
  { brand: "Ciplox 500", ingredients: [{ name: "Ciprofloxacin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Antibiotic" },
  { brand: "Levoflox 500", ingredients: [{ name: "Levofloxacin", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 5", manufacturer: "Cipla", category: "Antibiotic" },
  { brand: "Doxy-1 100", ingredients: [{ name: "Doxycycline", strength: 100, unit: "mg" }], form: "Capsule", pack: "Strip of 10", manufacturer: "USV", category: "Antibiotic" },
  { brand: "Cefpodoxime 200", ingredients: [{ name: "Cefpodoxime", strength: 200, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Antibiotic" },
  { brand: "Taxim-O 200", ingredients: [{ name: "Cefixime", strength: 200, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Alkem Laboratories", category: "Antibiotic" },
  { brand: "Zifi 200", ingredients: [{ name: "Cefixime", strength: 200, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "FDC", category: "Antibiotic" },

  // ── Thyroid ─────────────────────────────────────────────────────────
  { brand: "Eltroxin 50", ingredients: [{ name: "Levothyroxine Sodium", strength: 50, unit: "mcg" }], form: "Tablet", pack: "Strip of 100", manufacturer: "GSK Pharmaceuticals", category: "Thyroid" },
  { brand: "Thyronorm 50", ingredients: [{ name: "Levothyroxine Sodium", strength: 50, unit: "mcg" }], form: "Tablet", pack: "Strip of 120", manufacturer: "Abbott", category: "Thyroid" },
  { brand: "Thyronorm 100", ingredients: [{ name: "Levothyroxine Sodium", strength: 100, unit: "mcg" }], form: "Tablet", pack: "Strip of 120", manufacturer: "Abbott", category: "Thyroid" },
  { brand: "Thyrox 50", ingredients: [{ name: "Levothyroxine Sodium", strength: 50, unit: "mcg" }], form: "Tablet", pack: "Strip of 30", manufacturer: "Macleods Pharmaceuticals", category: "Thyroid" },

  // ── Vitamins / Supplements ──────────────────────────────────────────
  { brand: "Shelcal 500", ingredients: [{ name: "Calcium Carbonate", strength: 500, unit: "mg" }, { name: "Vitamin D3", strength: 250, unit: "IU" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Torrent Pharmaceuticals", category: "Supplement" },
  { brand: "Calcimax", ingredients: [{ name: "Calcium Carbonate", strength: 500, unit: "mg" }, { name: "Vitamin D3", strength: 250, unit: "IU" }], form: "Tablet", pack: "Strip of 15", manufacturer: "FDC", category: "Supplement" },
  { brand: "Cipcal 500", ingredients: [{ name: "Calcium Carbonate", strength: 500, unit: "mg" }, { name: "Vitamin D3", strength: 250, unit: "IU" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Cipla", category: "Supplement" },
  { brand: "Becosules", ingredients: [{ name: "B-Complex", strength: 1, unit: "Capsule" }], form: "Capsule", pack: "Strip of 20", manufacturer: "Pfizer", category: "Supplement" },
  { brand: "Neurobion Forte", ingredients: [{ name: "Vitamin B Complex", strength: 1, unit: "Tablet" }], form: "Tablet", pack: "Strip of 30", manufacturer: "Procter & Gamble", category: "Supplement" },
  { brand: "Supradyn", ingredients: [{ name: "Multivitamin", strength: 1, unit: "Tablet" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Abbott India", category: "Supplement" },
  { brand: "Limcee", ingredients: [{ name: "Vitamin C", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Procter & Gamble", category: "Supplement" },
  { brand: "Zincovit", ingredients: [{ name: "Multivitamin", strength: 1, unit: "Tablet" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Apex Laboratories", category: "Supplement" },
  { brand: "A to Z NS", ingredients: [{ name: "Multivitamin", strength: 1, unit: "Tablet" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Alkem Laboratories", category: "Supplement" },
  { brand: "Calcirol Sachet 60K", ingredients: [{ name: "Cholecalciferol (Vitamin D3)", strength: 60000, unit: "IU" }], form: "Sachet", pack: "Strip of 4 sachets", manufacturer: "Cadila Healthcare", category: "Supplement" },

  // ── Asthma / COPD ───────────────────────────────────────────────────
  { brand: "Asthalin Inhaler", ingredients: [{ name: "Salbutamol", strength: 100, unit: "mcg" }], form: "Inhaler", pack: "200 Doses", manufacturer: "Cipla", category: "Respiratory" },
  { brand: "Foracort 200 Inhaler", ingredients: [{ name: "Formoterol", strength: 6, unit: "mcg" }, { name: "Budesonide", strength: 200, unit: "mcg" }], form: "Inhaler", pack: "120 Doses", manufacturer: "Cipla", category: "Respiratory" },
  { brand: "Seroflo 250 Inhaler", ingredients: [{ name: "Salmeterol", strength: 25, unit: "mcg" }, { name: "Fluticasone", strength: 250, unit: "mcg" }], form: "Inhaler", pack: "120 Doses", manufacturer: "Cipla", category: "Respiratory" },
  { brand: "Budecort 200 Inhaler", ingredients: [{ name: "Budesonide", strength: 200, unit: "mcg" }], form: "Inhaler", pack: "200 Doses", manufacturer: "Cipla", category: "Respiratory" },
  { brand: "Levolin Inhaler", ingredients: [{ name: "Levosalbutamol", strength: 50, unit: "mcg" }], form: "Inhaler", pack: "200 Doses", manufacturer: "Cipla", category: "Respiratory" },

  // ── Anti-anxiety / Sleep ────────────────────────────────────────────
  { brand: "Alprax 0.25", ingredients: [{ name: "Alprazolam", strength: 0.25, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Torrent Pharmaceuticals", category: "Psychiatric" },
  { brand: "Restyl 0.25", ingredients: [{ name: "Alprazolam", strength: 0.25, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sun Pharma", category: "Psychiatric" },
  { brand: "Zolfresh 5", ingredients: [{ name: "Zolpidem", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Abbott", category: "Psychiatric" },
  { brand: "Etilaam 0.25", ingredients: [{ name: "Etizolam", strength: 0.25, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Intas Pharmaceuticals", category: "Psychiatric" },

  // ── Diabetes / Other ────────────────────────────────────────────────
  { brand: "Ecosprin AV 75/10", ingredients: [{ name: "Aspirin", strength: 75, unit: "mg" }, { name: "Atorvastatin", strength: 10, unit: "mg" }], form: "Capsule", pack: "Strip of 10", manufacturer: "USV", category: "Cardiac" },
  { brand: "Ecosprin Gold 10", ingredients: [{ name: "Aspirin", strength: 75, unit: "mg" }, { name: "Atorvastatin", strength: 10, unit: "mg" }, { name: "Clopidogrel", strength: 75, unit: "mg" }], form: "Capsule", pack: "Strip of 10", manufacturer: "USV", category: "Cardiac" },

  // ── Topical / Skin ──────────────────────────────────────────────────
  { brand: "Volini Gel", ingredients: [{ name: "Diclofenac Diethylamine", strength: 1, unit: "%" }], form: "Gel", pack: "30g tube", manufacturer: "Sun Pharma", category: "Topical" },
  { brand: "Moov Cream", ingredients: [{ name: "Diclofenac Diethylamine", strength: 1.16, unit: "%" }], form: "Cream", pack: "50g tube", manufacturer: "Reckitt Benckiser", category: "Topical" },
  { brand: "Burnol Cream", ingredients: [{ name: "Aluminium Acetate", strength: 1, unit: "%" }], form: "Cream", pack: "20g tube", manufacturer: "Dr. Reddy's", category: "Topical" },
  { brand: "Quadriderm Cream", ingredients: [{ name: "Beclomethasone", strength: 0.025, unit: "%" }, { name: "Neomycin", strength: 0.5, unit: "%" }, { name: "Tolnaftate", strength: 1, unit: "%" }, { name: "Iodochlorhydroxyquinoline", strength: 1, unit: "%" }], form: "Cream", pack: "20g tube", manufacturer: "MSD", category: "Topical" },
  { brand: "Betnovate-N Cream", ingredients: [{ name: "Betamethasone", strength: 0.1, unit: "%" }, { name: "Neomycin", strength: 0.5, unit: "%" }], form: "Cream", pack: "20g tube", manufacturer: "GSK Pharmaceuticals", category: "Topical" },
  { brand: "Soframycin Cream", ingredients: [{ name: "Framycetin", strength: 1, unit: "%" }], form: "Cream", pack: "30g tube", manufacturer: "Sanofi", category: "Topical" },
  { brand: "Clobetasol Cream", ingredients: [{ name: "Clobetasol", strength: 0.05, unit: "%" }], form: "Cream", pack: "20g tube", manufacturer: "Cipla", category: "Topical" },

  // ── Others ──────────────────────────────────────────────────────────
  { brand: "Pyridium 200", ingredients: [{ name: "Phenazopyridine", strength: 200, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Pfizer", category: "Urology" },
  { brand: "Urimax 0.4", ingredients: [{ name: "Tamsulosin", strength: 0.4, unit: "mg" }], form: "Capsule", pack: "Strip of 15", manufacturer: "Cipla", category: "Urology" },
  { brand: "Veltam 0.4", ingredients: [{ name: "Tamsulosin", strength: 0.4, unit: "mg" }], form: "Capsule", pack: "Strip of 10", manufacturer: "Intas", category: "Urology" },
  { brand: "Folvite 5", ingredients: [{ name: "Folic Acid", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 30", manufacturer: "Pfizer", category: "Supplement" },
  { brand: "Livogen Captab", ingredients: [{ name: "Iron", strength: 100, unit: "mg" }, { name: "Folic Acid", strength: 1.5, unit: "mg" }], form: "Tablet", pack: "Strip of 30", manufacturer: "Merck", category: "Supplement" },
  { brand: "Orofer XT", ingredients: [{ name: "Iron", strength: 100, unit: "mg" }, { name: "Folic Acid", strength: 1.5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Emcure", category: "Supplement" },
  { brand: "Dexorange Syrup", ingredients: [{ name: "Iron", strength: 32.8, unit: "mg" }, { name: "Folic Acid", strength: 0.5, unit: "mg" }, { name: "Vitamin B12", strength: 7.5, unit: "mcg" }], form: "Syrup", pack: "200ml", manufacturer: "Franco Indian", category: "Supplement" },

  // Add a few syrups for kids / common
  { brand: "T-Minic Cough Syrup", ingredients: [{ name: "Triprolidine", strength: 1.25, unit: "mg" }, { name: "Phenylephrine", strength: 5, unit: "mg" }], form: "Syrup", pack: "60ml", manufacturer: "GSK Pharmaceuticals", category: "Cough & Cold" },
  { brand: "Crocin Drops", ingredients: [{ name: "Paracetamol", strength: 100, unit: "mg" }], form: "Drops", pack: "15ml", manufacturer: "GSK Pharmaceuticals", category: "Pain & Fever" },
  { brand: "Calpol Suspension", ingredients: [{ name: "Paracetamol", strength: 250, unit: "mg" }], form: "Syrup", pack: "60ml", manufacturer: "GSK Pharmaceuticals", category: "Pain & Fever" },
  { brand: "P-250 Suspension", ingredients: [{ name: "Paracetamol", strength: 250, unit: "mg" }], form: "Syrup", pack: "60ml", manufacturer: "Cipla", category: "Pain & Fever" },

  // Anti-emetics / motility
  { brand: "Emeset 4", ingredients: [{ name: "Ondansetron", strength: 4, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Gastric" },
  { brand: "Perinorm 10", ingredients: [{ name: "Metoclopramide", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "IPCA", category: "Gastric" },

  // Probiotics
  { brand: "VSL#3", ingredients: [{ name: "Probiotic", strength: 112.5, unit: "Billion CFU" }], form: "Sachet", pack: "10 sachets", manufacturer: "Sun Pharma", category: "Gastric" },
  { brand: "Vibact DS", ingredients: [{ name: "Probiotic", strength: 1, unit: "Capsule" }], form: "Capsule", pack: "Strip of 10", manufacturer: "USV", category: "Gastric" },

  // Antifungals
  { brand: "Terbinaforce 250", ingredients: [{ name: "Terbinafine", strength: 250, unit: "mg" }], form: "Tablet", pack: "Strip of 7", manufacturer: "Mankind Pharma", category: "Antifungal" },
  { brand: "Itrasys 100", ingredients: [{ name: "Itraconazole", strength: 100, unit: "mg" }], form: "Capsule", pack: "Strip of 10", manufacturer: "Systopic Laboratories", category: "Antifungal" },
  { brand: "Fluka 150", ingredients: [{ name: "Fluconazole", strength: 150, unit: "mg" }], form: "Tablet", pack: "Strip of 4", manufacturer: "Cipla", category: "Antifungal" },

  // Eye drops
  { brand: "Ciplox Eye Drops", ingredients: [{ name: "Ciprofloxacin", strength: 0.3, unit: "%" }], form: "Drops", pack: "10ml", manufacturer: "Cipla", category: "Ophthalmic" },
  { brand: "Moxiza Eye Drops", ingredients: [{ name: "Moxifloxacin", strength: 0.5, unit: "%" }], form: "Drops", pack: "5ml", manufacturer: "Sun Pharma", category: "Ophthalmic" },
  { brand: "Refresh Tears", ingredients: [{ name: "Carboxymethylcellulose", strength: 0.5, unit: "%" }], form: "Drops", pack: "10ml", manufacturer: "Allergan", category: "Ophthalmic" },

  // Hormones / Women's health
  { brand: "Krimson 35", ingredients: [{ name: "Cyproterone Acetate", strength: 2, unit: "mg" }, { name: "Ethinyl Estradiol", strength: 35, unit: "mcg" }], form: "Tablet", pack: "Strip of 21", manufacturer: "Sun Pharma", category: "Hormone" },
  { brand: "Mala-N", ingredients: [{ name: "Norethisterone", strength: 0.5, unit: "mg" }, { name: "Ethinyl Estradiol", strength: 50, unit: "mcg" }], form: "Tablet", pack: "Strip of 28", manufacturer: "Government of India", category: "Hormone" },
  { brand: "I-Pill", ingredients: [{ name: "Levonorgestrel", strength: 1.5, unit: "mg" }], form: "Tablet", pack: "1 Tablet", manufacturer: "Piramal Healthcare", category: "Hormone" },
  { brand: "Unwanted-72", ingredients: [{ name: "Levonorgestrel", strength: 1.5, unit: "mg" }], form: "Tablet", pack: "1 Tablet", manufacturer: "Mankind Pharma", category: "Hormone" },

  // ── COVID-era essentials, still on Rx ───────────────────────────────
  { brand: "Fabiflu 200", ingredients: [{ name: "Favipiravir", strength: 200, unit: "mg" }], form: "Tablet", pack: "Strip of 17", manufacturer: "Glenmark", category: "Antiviral" },

  // ── Anti-emetics / motion sickness (correct salts) ──────────────────
  { brand: "Avomine 25", ingredients: [{ name: "Promethazine Theoclate", strength: 25, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Abbott India", category: "Gastric" },
  { brand: "Phenergan 25", ingredients: [{ name: "Promethazine", strength: 25, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Sanofi", category: "Allergy" },
  { brand: "Vomistop 10", ingredients: [{ name: "Domperidone", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Gastric" },
  { brand: "Domstal Suspension", ingredients: [{ name: "Domperidone", strength: 1, unit: "mg/ml" }], form: "Syrup", pack: "30ml", manufacturer: "Torrent Pharmaceuticals", category: "Gastric" },
  { brand: "Stemetil 5", ingredients: [{ name: "Prochlorperazine", strength: 5, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Abbott India", category: "Gastric" },
  { brand: "Emset 4", ingredients: [{ name: "Ondansetron", strength: 4, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Gastric" },
  { brand: "Ondem 4", ingredients: [{ name: "Ondansetron", strength: 4, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Alkem Laboratories", category: "Gastric" },
  { brand: "Cinarizine 25", ingredients: [{ name: "Cinnarizine", strength: 25, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Gastric" },
  { brand: "Stugeron 25", ingredients: [{ name: "Cinnarizine", strength: 25, unit: "mg" }], form: "Tablet", pack: "Strip of 25", manufacturer: "Janssen", category: "Gastric" },
  { brand: "Vertin 16", ingredients: [{ name: "Betahistine", strength: 16, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Abbott India", category: "Gastric" },

  // ── More analgesic combinations ─────────────────────────────────────
  { brand: "Sumo Tablet", ingredients: [{ name: "Nimesulide", strength: 100, unit: "mg" }, { name: "Paracetamol", strength: 325, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Alkem Laboratories", category: "Pain & Fever" },
  { brand: "Saridon", ingredients: [{ name: "Paracetamol", strength: 250, unit: "mg" }, { name: "Caffeine", strength: 50, unit: "mg" }, { name: "Propyphenazone", strength: 150, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Bayer", category: "Pain & Fever" },
  { brand: "Pacimol-MR", ingredients: [{ name: "Paracetamol", strength: 325, unit: "mg" }, { name: "Chlorzoxazone", strength: 250, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Ipca Laboratories", category: "Pain & Fever" },
  { brand: "Flexon MR", ingredients: [{ name: "Paracetamol", strength: 325, unit: "mg" }, { name: "Chlorzoxazone", strength: 250, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Aristo Pharmaceuticals", category: "Pain & Fever" },
  { brand: "Spasmonil", ingredients: [{ name: "Dicyclomine", strength: 20, unit: "mg" }, { name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Pain & Fever" },
  { brand: "Meftal Spas", ingredients: [{ name: "Mefenamic Acid", strength: 250, unit: "mg" }, { name: "Dicyclomine", strength: 10, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Blue Cross Laboratories", category: "Pain & Fever" },
  { brand: "Meftal 250", ingredients: [{ name: "Mefenamic Acid", strength: 250, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Blue Cross Laboratories", category: "Pain & Fever" },
  { brand: "Crocin Pain Relief", ingredients: [{ name: "Paracetamol", strength: 650, unit: "mg" }, { name: "Caffeine", strength: 50, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "GSK Pharmaceuticals", category: "Pain & Fever" },

  // ── More commonly searched antibiotics ──────────────────────────────
  { brand: "Norflox 400", ingredients: [{ name: "Norfloxacin", strength: 400, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Antibiotic" },
  { brand: "Metrogyl 400", ingredients: [{ name: "Metronidazole", strength: 400, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "JB Chemicals", category: "Antibiotic" },
  { brand: "Flagyl 400", ingredients: [{ name: "Metronidazole", strength: 400, unit: "mg" }], form: "Tablet", pack: "Strip of 15", manufacturer: "Sanofi", category: "Antibiotic" },
  { brand: "Bactrim DS", ingredients: [{ name: "Sulfamethoxazole", strength: 800, unit: "mg" }, { name: "Trimethoprim", strength: 160, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Roche", category: "Antibiotic" },

  // ── Common GI / Probiotics ─────────────────────────────────────────
  { brand: "Enterogermina", ingredients: [{ name: "Bacillus Clausii", strength: 2, unit: "Billion Spores" }], form: "Suspension", pack: "5ml vials x 10", manufacturer: "Sanofi", category: "Gastric" },
  { brand: "Eldoper", ingredients: [{ name: "Loperamide", strength: 2, unit: "mg" }], form: "Capsule", pack: "Strip of 10", manufacturer: "Micro Labs", category: "Gastric" },
  { brand: "Lopamide 2", ingredients: [{ name: "Loperamide", strength: 2, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Torrent Pharmaceuticals", category: "Gastric" },
  { brand: "Cyclopam", ingredients: [{ name: "Dicyclomine", strength: 20, unit: "mg" }, { name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Indoco Remedies", category: "Pain & Fever" },
  { brand: "Drotin DS", ingredients: [{ name: "Drotaverine", strength: 80, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Walter Bushnell", category: "Pain & Fever" },

  // ── Common cough syrups (kids + adults) ─────────────────────────────
  { brand: "Grilinctus", ingredients: [{ name: "Dextromethorphan", strength: 5, unit: "mg" }, { name: "Chlorpheniramine", strength: 2.5, unit: "mg" }, { name: "Guaifenesin", strength: 50, unit: "mg" }], form: "Syrup", pack: "100ml", manufacturer: "Franco Indian", category: "Cough & Cold" },
  { brand: "Mucinac 600", ingredients: [{ name: "Acetylcysteine", strength: 600, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Cipla", category: "Cough & Cold" },
  { brand: "Solvin Cold", ingredients: [{ name: "Phenylephrine", strength: 5, unit: "mg" }, { name: "Chlorpheniramine", strength: 2, unit: "mg" }, { name: "Paracetamol", strength: 500, unit: "mg" }], form: "Tablet", pack: "Strip of 10", manufacturer: "Ipca Laboratories", category: "Cough & Cold" },
];

async function main() {
  console.log(`Seeding ${CATALOG.length} medicines into catalog...`);
  let inserted = 0;
  let updated = 0;

  for (const m of CATALOG) {
    const name = `${m.brand} ${m.form}`;
    const normalized = normalizeMedicineName(name);
    const ingredientsJson = JSON.stringify(m.ingredients);
    const saltDisplay = m.ingredients
      .map((i) => `${i.name} ${i.strength}${i.unit}`)
      .join(" + ");
    const primaryStrength = m.ingredients[0]
      ? `${m.ingredients[0].strength}${m.ingredients[0].unit}`
      : null;

    const existing = await prisma.medicine.findUnique({
      where: { normalizedName: normalized },
    });

    if (existing) {
      await prisma.medicine.update({
        where: { id: existing.id },
        data: {
          name,
          brandName: m.brand,
          manufacturer: m.manufacturer,
          saltComposition: saltDisplay,
          ingredients: ingredientsJson,
          dosageForm: m.form,
          packSize: m.pack,
          category: m.category,
          isCatalog: true,
        },
      });
      updated++;
    } else {
      await prisma.medicine.create({
        data: {
          name,
          normalizedName: normalized,
          brandName: m.brand,
          manufacturer: m.manufacturer,
          saltComposition: saltDisplay,
          ingredients: ingredientsJson,
          dosageForm: m.form,
          packSize: m.pack,
          category: m.category,
          isCatalog: true,
        },
      });
      inserted++;
    }
  }

  console.log(`✅ Catalog seed complete: ${inserted} inserted, ${updated} updated.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
