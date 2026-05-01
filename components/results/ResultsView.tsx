"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Pill, FileWarning, ShieldX, Stethoscope, AlertTriangle, Info, Thermometer } from "lucide-react";
import { PriceCard } from "./PriceCard";
import { JanAushadhiCard } from "./JanAushadhiCard";
import { StoreLocatorPanel } from "./StoreLocatorPanel";
import { PriceHistoryChart } from "./PriceHistoryChart";
import { Alternatives } from "./Alternatives";
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
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storePanelOpen, setStorePanelOpen] = useState(false);
  const { location } = useLocation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    const params = new URLSearchParams();
    if (medicineId) params.set("medicineId", medicineId);
    else if (query) params.set("q", query);
    if (location?.pincode) params.set("pincode", location.pincode);

    fetch(`/api/search?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Search failed: ${r.status}`);
        return r.json();
      })
      .then((d: SearchResponse) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message ?? "Search failed");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medicineId, query, location?.pincode]);

  const medicine = data?.medicine;
  const listings = medicine?.listings ?? [];
  // Sort: in-stock first (already sorted server-side), then ascending price.
  // Compute cheapest among IN-STOCK listings only.
  const inStockListings = listings.filter((l) => l.inStock);
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
            <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight">
              {medicine.brandName ?? medicine.name}
            </h1>
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
            {listings.length === 0 && (
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
          </div>

          {medicine.drugDetail && (
            <div className="mt-8 glass-card p-6">
              <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <Info size={16} className="text-purple-300" /> About this medicine
              </h2>
              <div className="grid md:grid-cols-2 gap-5 text-sm">
                {medicine.drugDetail.uses && (
                  <Section icon={<Pill size={13} className="text-purple-300" />} title="Uses">
                    {medicine.drugDetail.uses}
                  </Section>
                )}
                {medicine.drugDetail.howItWorks && (
                  <Section icon={<Info size={13} className="text-purple-300" />} title="How it works">
                    {medicine.drugDetail.howItWorks}
                  </Section>
                )}
                {medicine.drugDetail.sideEffects && (
                  <Section icon={<AlertTriangle size={13} className="text-amber-300" />} title="Common side effects">
                    {medicine.drugDetail.sideEffects}
                  </Section>
                )}
                {medicine.drugDetail.warnings && (
                  <Section icon={<FileWarning size={13} className="text-red-300" />} title="Warnings">
                    {medicine.drugDetail.warnings}
                  </Section>
                )}
                {medicine.drugDetail.storage && (
                  <Section icon={<Thermometer size={13} className="text-cyan-300" />} title="Storage">
                    {medicine.drugDetail.storage}
                  </Section>
                )}
              </div>
              <p className="mt-5 text-[11px] text-text-muted leading-relaxed border-t border-white/5 pt-3">
                Educational information only — not a substitute for advice from a
                qualified doctor or pharmacist.
              </p>
            </div>
          )}

          {listings.length > 0 && (
            <div className="mt-8 space-y-6">
              <PriceHistoryChart medicineId={medicine.id} />
              <Alternatives
                medicineId={medicine.id}
                saltComposition={medicine.saltComposition}
              />
            </div>
          )}
        </>
      )}

      <StoreLocatorPanel
        open={storePanelOpen}
        onClose={() => setStorePanelOpen(false)}
      />
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted flex items-center gap-1.5 mb-1">
        {icon} {title}
      </div>
      <div className="text-text-secondary leading-relaxed">{children}</div>
    </div>
  );
}
