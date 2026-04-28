import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/search/SearchBar";
import { ResultsView } from "@/components/results/ResultsView";
import { BasketView } from "@/components/results/BasketView";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: { medicineId?: string; q?: string };
}): Promise<Metadata> {
  const id = searchParams.medicineId?.trim();
  const q = searchParams.q?.trim();
  let title = q ? `${q} — Compare prices` : "Search medicines";
  let description =
    "Compare prices of this medicine across 1mg, Apollo, Netmeds, PharmEasy, Truemeds, MrMed and Jan Aushadhi.";
  if (id) {
    try {
      const med = await prisma.medicine.findUnique({ where: { id } });
      if (med) {
        title = `${med.brandName ?? med.name} — Price comparison`;
        description = `Compare ${med.brandName ?? med.name}${
          med.saltComposition ? ` (${med.saltComposition})` : ""
        } prices across 1mg, Apollo, Netmeds, PharmEasy, Truemeds and MrMed. Find Jan Aushadhi generic alternatives and pincode delivery dates.`;
      }
    } catch {}
  }
  return {
    title,
    description,
    alternates: {
      canonical: id
        ? `/search?medicineId=${id}`
        : q
        ? `/search?q=${encodeURIComponent(q)}`
        : "/search",
    },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: {
    medicineId?: string;
    q?: string;
    method?: string;
    batch?: string;
  };
}) {
  const medicineId = (searchParams.medicineId ?? "").trim();
  const q = (searchParams.q ?? "").trim();
  const batch = (searchParams.batch ?? "").trim();

  let jsonLd: Record<string, unknown> | null = null;
  if (medicineId) {
    try {
      const med = await prisma.medicine.findUnique({
        where: { id: medicineId },
        include: {
          listings: {
            where: { sellingPrice: { not: null } },
            orderBy: { sellingPrice: "asc" },
            take: 6,
          },
        },
      });
      if (med) {
        jsonLd = {
          "@context": "https://schema.org",
          "@type": "Drug",
          name: med.brandName ?? med.name,
          activeIngredient: med.saltComposition ?? undefined,
          manufacturer: med.manufacturer
            ? { "@type": "Organization", name: med.manufacturer }
            : undefined,
          dosageForm: med.dosageForm ?? undefined,
          prescriptionStatus: med.prescriptionRequired
            ? "PrescriptionOnly"
            : "OTC",
          offers:
            med.listings.length > 0
              ? med.listings.map((l) => ({
                  "@type": "Offer",
                  price: l.sellingPrice ?? l.mrp,
                  priceCurrency: "INR",
                  availability: l.inStock
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                  seller: { "@type": "Organization", name: l.pharmacyName },
                  url: l.productUrl ?? undefined,
                }))
              : undefined,
        };
      }
    } catch {}
  }

  // If batch param provided, run basket comparison (free-text basket flow)
  const queries = batch
    ? [q, ...batch.split(",").map((s) => s.trim()).filter(Boolean)].filter(Boolean)
    : [];

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Header />
      <main className="pb-20">
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <SearchBar initialValue={q} />
        </div>

        {queries.length > 1 ? (
          <BasketView queries={queries} />
        ) : medicineId ? (
          <ResultsView medicineId={medicineId} query={q} />
        ) : q ? (
          <ResultsView query={q} />
        ) : (
          <div className="text-center py-20 text-text-secondary">
            Start typing a medicine name above. Results come from our verified
            catalog.
          </div>
        )}
      </main>
    </>
  );
}
