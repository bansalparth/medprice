/**
 * Curated, plain-language drug info for the most common medicines.
 * Keyed by lowercased brandName or first ingredient name.
 *
 * This isn't medical advice — it's the kind of summary an Indian patient sees
 * on 1mg / Apollo product pages so they know what they're buying.
 */

export interface DrugDetail {
  uses: string;
  howItWorks: string;
  sideEffects: string;
  warnings: string;
  storage?: string;
  prescriptionRequired: boolean;
  soldOnline: boolean;
}

export const DRUG_DETAILS: Record<string, DrugDetail> = {
  paracetamol: {
    uses: "Relieves mild to moderate pain and reduces fever.",
    howItWorks: "Blocks chemical messengers in the brain that signal pain and raise body temperature.",
    sideEffects: "Generally well-tolerated. Rare: nausea, allergic rash, liver injury at high doses.",
    warnings: "Do not exceed 4g per day. Avoid with alcohol or pre-existing liver disease.",
    storage: "Store below 30°C, away from moisture and direct sunlight.",
    prescriptionRequired: false,
    soldOnline: true,
  },
  ibuprofen: {
    uses: "Relieves pain, inflammation, and fever (headache, muscle ache, arthritis, period pain).",
    howItWorks: "Blocks prostaglandins, the chemicals that cause pain and swelling.",
    sideEffects: "Stomach upset, heartburn, dizziness. Long term: kidney or stomach bleeding.",
    warnings: "Take with food. Avoid in ulcers, kidney disease, pregnancy (3rd trimester).",
    prescriptionRequired: false,
    soldOnline: true,
  },
  aspirin: {
    uses: "Pain, fever, anti-clotting in cardiac patients.",
    howItWorks: "Inhibits cyclo-oxygenase, reducing prostaglandins and platelet aggregation.",
    sideEffects: "GI irritation, bleeding risk, tinnitus at high doses.",
    warnings: "Avoid in children with viral illness (Reye's syndrome). Consult before surgery.",
    prescriptionRequired: false,
    soldOnline: true,
  },
  azithromycin: {
    uses: "Bacterial infections of the chest, throat, skin, and ear.",
    howItWorks: "Stops bacteria from making proteins they need to grow and multiply.",
    sideEffects: "Diarrhoea, nausea, abdominal pain, mild rash.",
    warnings: "Complete the full course even if you feel better. Avoid antacids within 2 hours.",
    prescriptionRequired: true,
    soldOnline: true,
  },
  amoxicillin: {
    uses: "Bacterial infections — chest, ear, throat, skin, urinary tract.",
    howItWorks: "Penicillin antibiotic that breaks down bacterial cell walls.",
    sideEffects: "Diarrhoea, rash, nausea. Seek help if rash spreads or breathing becomes difficult.",
    warnings: "Tell your doctor about any penicillin allergy.",
    prescriptionRequired: true,
    soldOnline: true,
  },
  metformin: {
    uses: "Type 2 diabetes — controls blood sugar.",
    howItWorks: "Reduces glucose production by the liver and improves insulin sensitivity.",
    sideEffects: "Loose stools, metallic taste, vitamin B12 deficiency on long use.",
    warnings: "Take with meals. Stop temporarily before surgery or contrast scans.",
    prescriptionRequired: true,
    soldOnline: true,
  },
  pantoprazole: {
    uses: "Acidity, heartburn, GERD, stomach ulcers.",
    howItWorks: "Blocks the stomach's proton pumps, cutting acid production.",
    sideEffects: "Headache, diarrhoea, abdominal pain. Long term: low magnesium, B12, bone loss.",
    warnings: "Take 30-60 min before food. Don't use beyond 8 weeks without doctor advice.",
    prescriptionRequired: false,
    soldOnline: true,
  },
  cetirizine: {
    uses: "Allergic rhinitis, urticaria (hives), itching.",
    howItWorks: "Blocks histamine receptors that drive allergy symptoms.",
    sideEffects: "Drowsiness, dry mouth, fatigue.",
    warnings: "Avoid alcohol. Use caution when driving.",
    prescriptionRequired: false,
    soldOnline: true,
  },
  promethazine: {
    uses: "Nausea, vomiting, motion sickness, allergy.",
    howItWorks: "Blocks histamine and dopamine receptors involved in vomiting and allergy.",
    sideEffects: "Drowsiness, dry mouth, blurred vision.",
    warnings: "Avoid driving. Not for children under 2 years.",
    prescriptionRequired: false,
    soldOnline: true,
  },
  domperidone: {
    uses: "Nausea, vomiting, bloating after meals.",
    howItWorks: "Speeds up stomach emptying by blocking dopamine in the gut.",
    sideEffects: "Headache, dry mouth, rare cardiac rhythm changes.",
    warnings: "Use shortest course possible. Tell your doctor if you have heart issues.",
    prescriptionRequired: true,
    soldOnline: true,
  },
  ranitidine: {
    uses: "Acidity and ulcers (less commonly prescribed in India now).",
    howItWorks: "Blocks H2 histamine receptors in the stomach to reduce acid.",
    sideEffects: "Headache, constipation, diarrhoea.",
    warnings: "Many countries have suspended ranitidine due to NDMA contamination concerns.",
    prescriptionRequired: false,
    soldOnline: false,
  },
  amlodipine: {
    uses: "High blood pressure, angina (chest pain).",
    howItWorks: "Relaxes blood vessels by blocking calcium channels.",
    sideEffects: "Ankle swelling, flushing, headache, dizziness.",
    warnings: "Take at the same time daily. Don't stop suddenly.",
    prescriptionRequired: true,
    soldOnline: true,
  },
  atorvastatin: {
    uses: "High cholesterol, prevention of heart disease.",
    howItWorks: "Blocks HMG-CoA reductase, the enzyme the liver uses to make cholesterol.",
    sideEffects: "Muscle ache, mild liver enzyme rise, indigestion.",
    warnings: "Tell doctor if you get unexplained muscle pain or dark urine.",
    prescriptionRequired: true,
    soldOnline: true,
  },
};

const KEYS = Object.keys(DRUG_DETAILS);

export function lookupDrugDetail(
  brandName?: string | null,
  ingredients?: string | null
): DrugDetail | null {
  const candidates: string[] = [];
  if (brandName) candidates.push(brandName.toLowerCase());
  if (ingredients) {
    try {
      const parsed = JSON.parse(ingredients);
      if (Array.isArray(parsed)) {
        for (const i of parsed) {
          if (i?.name) candidates.push(String(i.name).toLowerCase());
        }
      }
    } catch {
      candidates.push(ingredients.toLowerCase());
    }
  }

  for (const c of candidates) {
    for (const k of KEYS) {
      if (c.includes(k)) return DRUG_DETAILS[k];
    }
  }
  return null;
}
