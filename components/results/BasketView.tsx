"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Crown, Loader2, ShoppingCart, ExternalLink, Heart, Check, X, Truck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLocation } from "@/lib/location-context";

const PHARMACY_LABELS: Record<string, string> = {
  "1mg": "1mg",
  netmeds: "Netmeds",
  pharmeasy: "PharmEasy",
  apollo: "Apollo",
  truemeds: "Truemeds",
  mrmed: "MrMed",
};

interface PharmacyEntry {
  productName: string;
  price: number;
  productUrl: string | null;
  inStock: boolean;
  deliveryEta: string;
}

interface BasketItem {
  query: string;
  medicineId: string | null;
  medicineName: string;
  perPharmacy: Record<string, PharmacyEntry | null>;
  janAushadhiPrice: number | null;
}

interface BasketResponse {
  items: BasketItem[];
  totals: Record<string, { total: number; covered: number; missing: string[] }>;
  janAushadhi: { total: number; covered: number; missing: string[] };
}

export function BasketView({ queries }: { queries: string[] }) {
  const [data, setData] = useState<BasketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { location } = useLocation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/basket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries, pincode: location?.pincode ?? null }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Basket failed: ${r.status}`);
        return r.json();
      })
      .then((d: BasketResponse) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [queries.join(","), location?.pincode]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Loader2 className="animate-spin text-purple-400" />
          <div>
            <div className="font-medium">
              Pricing your basket of {queries.length} medicines across 6 pharmacies...
            </div>
            <div className="text-text-secondary text-xs">
              ~{Math.ceil(queries.length * 6)}s for new medicines, instant for cached.
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: queries.length }).map((_, i) => (
            <div key={i} className="glass-card p-5">
              <div className="skeleton h-5 w-1/3 mb-3" />
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className="skeleton h-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-red-400">
        {error ?? "Failed to load basket."}
      </div>
    );
  }

  // Pharmacies sorted by total ascending (only those that cover something)
  const pharmacyRanking = Object.entries(data.totals)
    .filter(([, t]) => t.covered > 0)
    .sort((a, b) => a[1].total - b[1].total);

  const cheapestPharmacy = pharmacyRanking[0];
  const allPharmaciesInOrder = pharmacyRanking.map(([n]) => n);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight flex items-center gap-3">
          <ShoppingCart className="text-purple-400" /> Your Basket
        </h1>
        <p className="text-text-secondary mt-1">
          {data.items.length} medicines · ranked by total cost across pharmacies
        </p>
      </motion.div>

      {/* Best total banner */}
      {cheapestPharmacy && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl bg-gradient-to-br from-purple-400/15 to-amber-700/10 border border-purple-400/30 p-6 mb-5 flex items-center gap-4 flex-wrap"
        >
          <Crown size={28} className="text-purple-300" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-display font-bold text-xl">
              Best total at{" "}
              <span className="gradient-text">
                {PHARMACY_LABELS[cheapestPharmacy[0]] ?? cheapestPharmacy[0]}
              </span>
            </div>
            <div className="text-sm text-text-secondary">
              {cheapestPharmacy[1].covered} of {data.items.length} medicines covered
              {cheapestPharmacy[1].missing.length > 0 && (
                <> · missing: {cheapestPharmacy[1].missing.join(", ")}</>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display font-bold text-3xl gradient-text">
              {formatCurrency(cheapestPharmacy[1].total)}
            </div>
          </div>
        </motion.div>
      )}

      {/* Jan Aushadhi total */}
      {data.janAushadhi.covered > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl ja-row p-6 mb-6 flex items-center gap-4 flex-wrap"
        >
          <Heart size={26} className="text-emerald-400" fill="currentColor" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-display font-bold text-xl gradient-text-green">
              Jan Aushadhi Total
            </div>
            <div className="text-sm text-text-secondary">
              {data.janAushadhi.covered} of {data.items.length} have a generic match
              {cheapestPharmacy &&
                data.janAushadhi.total < cheapestPharmacy[1].total &&
                ` · save ${formatCurrency(cheapestPharmacy[1].total - data.janAushadhi.total)} vs ${PHARMACY_LABELS[cheapestPharmacy[0]]}`}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display font-bold text-3xl gradient-text-green">
              {formatCurrency(data.janAushadhi.total)}
            </div>
          </div>
        </motion.div>
      )}

      {/* Comparison table */}
      <div className="glass-card p-2 md:p-4 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-text-secondary text-xs uppercase tracking-wider">
              <th className="text-left p-3 sticky left-0 bg-ink-950/95 z-10">
                Medicine
              </th>
              {allPharmaciesInOrder.map((ph, i) => (
                <th key={ph} className="text-right p-3 min-w-[100px]">
                  <div className={i === 0 ? "text-purple-300" : ""}>
                    {PHARMACY_LABELS[ph] ?? ph}
                    {i === 0 && (
                      <Crown
                        size={11}
                        className="inline ml-1 -mt-1"
                      />
                    )}
                  </div>
                </th>
              ))}
              <th className="text-right p-3 text-emerald-400 min-w-[100px]">
                Jan Aushadhi
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => {
              // Find cheapest price for this row across all pharmacies
              const rowPrices = allPharmaciesInOrder
                .map((ph) => item.perPharmacy[ph]?.price ?? null)
                .filter((v): v is number => v != null);
              const minRow = rowPrices.length > 0 ? Math.min(...rowPrices) : null;

              return (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-t border-white/5 hover:bg-white/[0.02]"
                >
                  <td className="p-3 sticky left-0 bg-ink-950/95 z-10">
                    {item.medicineId ? (
                      <Link
                        href={`/search?q=${encodeURIComponent(item.medicineName)}`}
                        className="font-medium hover:text-purple-400"
                      >
                        {item.medicineName}
                      </Link>
                    ) : (
                      <span className="text-text-muted">{item.medicineName}</span>
                    )}
                  </td>
                  {allPharmaciesInOrder.map((ph, j) => {
                    const e = item.perPharmacy[ph];
                    const isMinForRow = e && minRow != null && e.price === minRow;
                    return (
                      <td key={ph} className="p-3 text-right">
                        {e ? (
                          <a
                            href={e.productUrl ?? "#"}
                            target="_blank"
                            rel="noreferrer noopener"
                            className={`inline-flex flex-col items-end gap-0.5 ${
                              !e.inStock
                                ? "opacity-50"
                                : isMinForRow
                                ? "text-purple-300 font-semibold"
                                : "text-text-primary"
                            } hover:text-purple-400`}
                            title={`${e.productName} — ${
                              e.inStock ? `delivers ${e.deliveryEta}` : "out of stock"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {formatCurrency(e.price)}
                              <ExternalLink size={10} />
                            </span>
                            {e.inStock ? (
                              <span className="text-[10px] text-emerald-300/80 font-normal flex items-center gap-1">
                                <Truck size={9} /> {e.deliveryEta}
                              </span>
                            ) : (
                              <span className="text-[10px] text-red-400 font-normal">
                                OOS
                              </span>
                            )}
                          </a>
                        ) : (
                          <X size={14} className="text-text-muted inline" />
                        )}
                      </td>
                    );
                  })}
                  <td className="p-3 text-right">
                    {item.janAushadhiPrice != null ? (
                      <span className="text-emerald-400 font-semibold">
                        {formatCurrency(item.janAushadhiPrice)}
                      </span>
                    ) : (
                      <X size={14} className="text-text-muted inline" />
                    )}
                  </td>
                </motion.tr>
              );
            })}
            {/* Totals row */}
            <tr className="border-t-2 border-white/10 bg-white/[0.02]">
              <td className="p-3 font-semibold sticky left-0 bg-ink-950/95 z-10">
                Total
              </td>
              {allPharmaciesInOrder.map((ph, i) => (
                <td
                  key={ph}
                  className={`p-3 text-right font-display font-bold ${
                    i === 0 ? "text-purple-300 text-lg" : ""
                  }`}
                >
                  {formatCurrency(data.totals[ph]?.total ?? 0)}
                  {data.totals[ph]?.covered < data.items.length && (
                    <div className="text-[10px] text-text-muted font-normal font-body">
                      ({data.totals[ph]?.covered}/{data.items.length})
                    </div>
                  )}
                </td>
              ))}
              <td className="p-3 text-right font-display font-bold text-emerald-400 text-lg">
                {formatCurrency(data.janAushadhi.total)}
                {data.janAushadhi.covered < data.items.length && (
                  <div className="text-[10px] text-text-muted font-normal font-body">
                    ({data.janAushadhi.covered}/{data.items.length})
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-text-muted text-center">
        Per-medicine cheapest price highlighted in gold. Pharmacy with lowest covered total wins overall.
      </p>
    </div>
  );
}
