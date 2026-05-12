import { Header } from "@/components/Header";
import { PriceCardSkeleton } from "@/components/results/PriceCardSkeleton";

const PLACEHOLDER_PHARMACIES = [
  "1mg",
  "pharmeasy",
  "netmeds",
  "truemeds",
  "mrmed",
];

export default function SearchLoading() {
  return (
    <>
      <Header />
      <main className="pb-20">
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <div className="search-input glass-card flex items-center gap-1 px-4 py-2.5">
            <div className="h-10 w-full" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-3">
          {PLACEHOLDER_PHARMACIES.map((p, i) => (
            <PriceCardSkeleton key={p} pharmacyName={p} index={i} />
          ))}
        </div>
      </main>
    </>
  );
}
