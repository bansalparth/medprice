"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Crown, Loader2, ShoppingCart, ExternalLink, Heart, Check, X, Truck, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLocation } from "@/lib/location-context";
import { apiFetch } from "@/lib/api-client";

const PHARMACY_LABELS: Record<string, string> = {
  "1mg": "1mg",
  netmeds: "Netmeds",
  pharmeasy: "PharmEasy",
  apollo: "Apollo",
  truemeds: "Truemeds",
  mrmed: "MrMed",
};

const DEFAULT_VISIBLE_PHARMACIES = ["netmeds", "pharmeasy", "truemeds", "1mg"];

interface PharmacyEntry {
  productName: string;
  /** Unconditional per-unit price (no conditional coupon applied). */
  price: number;
  productUrl: string | null;
  inStock: boolean;
  deliveryEta: string | null;
  /** Conditional coupon — only Pharmeasy exposes this today (MED27PE etc). */
  couponCode?: string | null;
  couponMinCart?: number | null;
  couponFinalPrice?: number | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { location } = useLocation();

  const runFetch = (refresh: boolean) => {
    let cancelled = false;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    apiFetch("/api/basket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries,
        pincode: location?.pincode ?? null,
        refresh,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Basket failed: ${r.status}`);
        return r.json();
      })
      .then((d: BasketResponse) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
          setRefreshing(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    return runFetch(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Pharmacies sorted by coverage desc, then total asc
  const pharmacyRanking = Object.entries(data.totals)
    .filter(([, t]) => t.covered > 0)
    .sort((a, b) => {
      const covDiff = b[1].covered - a[1].covered;
      if (covDiff !== 0) return covDiff;
      return a[1].total - b[1].total;
    });

  const cheapestPharmacy = pharmacyRanking[0];
  // When no pharmacy carries any of the medicines, still render the main 4
  // columns (all X's) so the user can see what was checked.
  const allPharmaciesInOrder =
    pharmacyRanking.length > 0
      ? pharmacyRanking.map(([n]) => n)
      : DEFAULT_VISIBLE_PHARMACIES;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display font-bold text-3xl md:text-4xl tracking-tight flex items-center gap-3">
            <ShoppingCart className="text-purple-400" /> Your Basket
          </h1>
          <button
            onClick={() => runFetch(true)}
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
        <p className="text-text-secondary mt-1">
          {data.items.length} medicines · ranked by coverage, then cost
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
              <th className="text-left p-3 sticky left-0 bg-[var(--bg-primary)]/95 z-10">
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
                  className="border-t border-overlay-5 hover:bg-overlay-3"
                >
                  <td className="p-3 sticky left-0 bg-[var(--bg-primary)]/95 z-10">
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
                            title={`${e.productName}${
                              e.inStock
                                ? e.deliveryEta
                                  ? ` — delivers ${e.deliveryEta}`
                                  : ""
                                : " — out of stock"
                            }`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {formatCurrency(e.price)}
                              <ExternalLink size={10} />
                            </span>
                            {e.inStock ? (
                              e.deliveryEta ? (
                                <span className="text-[10px] text-emerald-300/80 font-normal flex items-center gap-1">
                                  <Truck size={9} /> {e.deliveryEta}
                                </span>
                              ) : null
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
            <tr className="border-t-2 border-overlay-10 bg-overlay-3">
              <td className="p-3 font-semibold sticky left-0 bg-[var(--bg-primary)]/95 z-10">
                Total
              </td>
              {allPharmaciesInOrder.map((ph, i) => {
                // Conditional-coupon math: if any item at this pharmacy
                // carries a coupon (Pharmeasy MED27PE etc), compute the
                // alternate total and see if the basket clears the min cart.
                let couponTotal = 0;
                let minCartFloor = 0;
                let anyCoupon = false;
                let couponCode: string | null = null;
                for (const item of data.items) {
                  const e = item.perPharmacy[ph];
                  if (!e) continue;
                  couponTotal += e.couponFinalPrice ?? e.price;
                  if (e.couponCode) {
                    anyCoupon = true;
                    couponCode = couponCode ?? e.couponCode;
                    if (e.couponMinCart != null && e.couponMinCart > minCartFloor) {
                      minCartFloor = e.couponMinCart;
                    }
                  }
                }
                const baseTotal = data.totals[ph]?.total ?? 0;
                const showCouponLine =
                  anyCoupon &&
                  couponTotal < baseTotal &&
                  baseTotal >= minCartFloor;
                return (
                  <td
                    key={ph}
                    className={`p-3 text-right font-display font-bold ${
                      i === 0 ? "text-purple-300 text-lg" : ""
                    }`}
                  >
                    {formatCurrency(baseTotal)}
                    {data.totals[ph]?.covered < data.items.length && (
                      <div className="text-[10px] text-text-muted font-normal font-body">
                        ({data.totals[ph]?.covered}/{data.items.length})
                      </div>
                    )}
                    {showCouponLine && (
                      <div
                        className="text-[10px] text-text-muted font-normal font-body leading-tight mt-1"
                        title={`Applies on app orders with cart ≥ ${formatCurrency(
                          minCartFloor
                        )}`}
                      >
                        with {couponCode}:{" "}
                        <span className="text-text-secondary">
                          {formatCurrency(couponTotal)}
                        </span>
                      </div>
                    )}
                  </td>
                );
              })}
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
        Per-medicine cheapest price highlighted in gold. Pharmacy covering the most medicines wins; ties broken by lowest total.
      </p>
    </div>
  );
}
