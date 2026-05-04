"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Pill, ShieldX, Stethoscope, ChevronDown, RefreshCw } from "lucide-react";
import { PriceCard } from "./PriceCard";
import { JanAushadhiCard } from "./JanAushadhiCard";
import { StoreLocatorPanel } from "./StoreLocatorPanel";
import { SearchProgress } from "./SearchProgress";
import { formatCurrency } from "@/lib/utils";
import { useLocation } from "@/lib/location-context";

interface Listing {
  id: string;
  pharmacyName: string;
  productName: string;
  packSize?: string | null;
  mrp?: number | null;
  sellingPrice?: number | null;
  discountPercent?: number | null;
  inStock: boolean;
  productUrl?: string | null;
  scrapedAt: string;
  deliveryEta?: string | null;
}

interface DrugDetail {
  uses: string | null;
  howItWorks: string | null;
  sideEffects: string | null;
  warnings: string | null;
  storage: string | null;
  prescriptionRequired: boolean;
  soldOnline: boolean;
}

interface SaltMapping {
  id: string;
  matchConfidence: string;
  janAushadhiProduct: {
    id: string;
    drugCode: string;
    genericName: string;
    unitSize?: string | null;
    mrpBppi?: number | null;
  };
}

interface MedicineData {
  id: string;
  name: string;
  brandName?: string | null;
  manufacturer?: string | null;
  dosageForm?: string | null;
  packSize?: string | null;
  saltComposition?: string | null;
  category?: string | null;
  listings: Listing[];
  saltMappings: SaltMapping[];
  drugDetail?: DrugDetail | null;
}

interface SearchResponse {
  medicine: MedicineData | null;
  cached?: boolean;
  stale?: boolean;
  message?: string;
}

interface Props {
  medicineId?: string;
  query?: string;
}

export function ResultsView({ medicineId, query }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storePanelOpen, setStorePanelOpen] = useState(false);
  const { location } = useLocation();
  const cancelledRef = useRef(false);

  const runSearch = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (medicineId) params.set("medicineId", medicineId);
      else if (query) params.set("q", query);
      if (location?.pincode) params.set("pincode", location.pincode);
      if (opts.refresh) params.set("refresh", "1");

      if (opts.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setData(null);
      }
      setError(null);

      try {
        const r = await fetch(`/api/search?${params}`);
        if (!r.ok) throw new Error(`Search failed: ${r.status}`);
        const d: SearchResponse = await r.json();
        if (!cancelledRef.current) setData(d);
      } catch (err: any) {
        if (!cancelledRef.current) setError(err?.message ?? "Search failed");
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [medicineId, query, location?.pincode]
  );

  useEffect(() => {
    cancelledRef.current = false;
    runSearch();
    return () => {
      cancelledRef.current = true;
    };
  }, [runSearch]);

  const [showOos, setShowOos] = useState(false);

  const medicine = data?.medicine;
  const allListings = medicine?.listings ?? [];
  const inStockListings = allListings.filter((l) => l.inStock);
  const oosListings = allListings.filter((l) => !l.inStock);
  const listings = inStockListings;
  const cheapest = inStockListings.find((l) => l.sellingPrice != null);
  const cheapestPrice = cheapest?.sellingPrice ?? null;
  const janAushadhiMatch = medicine?.saltMappings?.[0]?.janAushadhiProduct ?? null;
  const savings =
    janAushadhiMatch?.mrpBppi && cheapestPrice
      ? Math.max(0, cheapestPrice - janAushadhiMatch.mrpBppi)
      : null;
  const savingsPct =
    savings && cheapestPrice
      ? Math.round((savings / cheapestPrice) * 100)
      : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {loading && (
        <SearchProgress
          query={query ?? medicineId ?? "medicine"}
          city={location?.city ?? null}
          pincode={location?.pincode ?? null}
        />
      )}

      {!loading && error && (
        <div className="glass-card p-8 flex items-start gap-3 text-red-300">
          <AlertCircle size={20} />
          <div>
            <div className="font-semibold">Something went wrong</div>
            <div className="text-sm text-text-secondary mt-1">{error}</div>
          </div>
        </div>
      )}

      {!loading && !error && !medicine && (
        <div className="glass-card p-12 text-center">
          <Pill size={32} className="mx-auto mb-4 text-text-muted" />
          <h2 className="font-display font-bold text-xl mb-2">
            No results
          </h2>
          <p className="text-text-secondary text-sm">
            We couldn't find this medicine in any of the 6 pharmacies right now.
          </p>
        </div>
      )}

      {!loading && medicine && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight">
                {medicine.brandName ?? medicine.name}
              </h1>
              <button
                onClick={() => runSearch({ refresh: true })}
                disabled={refreshing}
                title="Force fresh scrape (bypass cache)"
                className="shrink-0 mt-1 flex items-center gap-1.5 text-xs text-text-secondary hover:text-white px-2.5 py-1.5 rounded-full border border-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw
                  size={12}
                  className={refreshing ? "animate-spin" : ""}
                />
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {medicine.dosageForm && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300">
                  {medicine.dosageForm}
                </span>
              )}
              {medicine.packSize && (
                <span className="text-xs text-text-secondary">
                  {medicine.packSize}
                </span>
              )}
              {medicine.manufacturer && (
                <span className="text-xs text-text-muted">
                  · by {medicine.manufacturer}
                </span>
              )}
              {medicine.drugDetail?.prescriptionRequired && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Stethoscope size={10} /> Rx required
                </span>
              )}
              {medicine.drugDetail && medicine.drugDetail.soldOnline === false && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30 flex items-center gap-1">
                  <ShieldX size={10} /> Not sold online
                </span>
              )}
              {medicine.drugDetail?.soldOnline && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                  Sold online
                </span>
              )}
            </div>
            {medicine.saltComposition && (
              <p className="text-text-secondary mt-1.5">
                {medicine.saltComposition}
              </p>
            )}
            {data?.stale && (
              <p className="text-xs text-yellow-400 mt-2">
                Showing cached prices — live scrape returned no fresh results.
              </p>
            )}
          </motion.div>

          {janAushadhiMatch && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-5"
            >
              <div className="rounded-2xl bg-gradient-to-br from-emerald-900/40 to-emerald-950/20 border border-emerald-500/25 p-5 mb-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">💚</div>
                  <div>
                    <div className="font-display font-bold text-lg gradient-text-green">
                      Generic available at Jan Aushadhi
                    </div>
                    <div className="text-sm text-text-secondary mt-1">
                      {savings && savingsPct ? (
                        <>
                          Save{" "}
                          <span className="text-emerald-400 font-semibold">
                            {formatCurrency(savings)} ({savingsPct}%)
                          </span>{" "}
                          vs the cheapest online pharmacy.
                        </>
                      ) : (
                        <>The same molecule is available at a government store near you.</>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <JanAushadhiCard
                product={janAushadhiMatch}
                cheapestOnlinePrice={cheapestPrice}
                onFindStore={() => setStorePanelOpen(true)}
              />
            </motion.div>
          )}

          <div className="space-y-3">
            {allListings.length === 0 && (
              <div className="glass-card p-8 text-center">
                {medicine.drugDetail?.soldOnline === false ? (
                  <>
                    <ShieldX
                      size={28}
                      className="mx-auto mb-3 text-red-300"
                    />
                    <div className="font-display font-semibold text-base mb-1">
                      Not sold online in India
                    </div>
                    <div className="text-text-secondary text-sm leading-relaxed max-w-md mx-auto">
                      This medicine isn&apos;t listed by any online pharmacy.
                      {janAushadhiMatch
                        ? " A Jan Aushadhi generic alternative is available below — try a nearby store."
                        : " Check a nearby pharmacy for availability."}
                    </div>
                  </>
                ) : data?.message ? (
                  <div className="text-text-secondary text-sm leading-relaxed max-w-md mx-auto">
                    {data.message}
                  </div>
                ) : (
                  <div className="text-text-secondary text-sm leading-relaxed max-w-md mx-auto">
                    No live pharmacy listings yet. Our scrapers couldn&apos;t
                    find it. Try again in a moment.
                  </div>
                )}
              </div>
            )}
            {listings.map((l, i) => (
              <PriceCard
                key={l.id}
                listing={l}
                medicineId={medicine.id}
                isCheapest={l.id === cheapest?.id}
                index={i}
              />
            ))}
            {oosListings.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowOos((v) => !v)}
                  className="flex items-center gap-2 text-text-secondary text-sm hover:text-white transition-colors mx-auto"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showOos ? "rotate-180" : ""}`}
                  />
                  {oosListings.length} {oosListings.length === 1 ? "pharmacy" : "pharmacies"} out of stock
                </button>
                {showOos &&
                  oosListings.map((l, i) => (
                    <PriceCard
                      key={l.id}
                      listing={l}
                      medicineId={medicine.id}
                      isCheapest={false}
                      index={inStockListings.length + i}
                    />
                  ))}
              </div>
            )}
          </div>

        </>
      )}

      <StoreLocatorPanel
        open={storePanelOpen}
        onClose={() => setStorePanelOpen(false)}
      />
    </div>
  );
}
