import { Header } from "@/components/Header";
import { SearchProgress } from "@/components/results/SearchProgress";

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
        <div className="max-w-5xl mx-auto px-4 py-8">
          <SearchProgress query="medicine" city={null} pincode={null} />
        </div>
      </main>
    </>
  );
}
