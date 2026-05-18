"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Pill, ShieldX, Stethoscope, ChevronDown, RefreshCw } from "lucide-react";
import { PriceCard } from "./PriceCard";
import { PriceCardSkeleton } from "./PriceCardSkeleton";
import { JanAushadhiCard } from "./JanAushadhiCard";
import { StoreLocatorPanel } from "./StoreLocatorPanel";
import { DrugInfo } from "./DrugInfo";
import { apiFetch } from "@/lib/api-client";
import { Alternatives } from "./Alternatives";
import { formatCurrency } from "@/lib/utils";
import { extractPackCount } from "@/lib/pack-size";
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
  /** True while we're still waiting for the live serviceability check.
   *  Set to false the moment a `{type:"serviceability"}` chunk lands for
   *  this listing id — at which point `deliveryEta` is the real value
   *  (or null if the pharmacy doesn't expose one). */
  etaPending?: boolean;
  /** Unconditional price + conditional coupon block (Pharmeasy only today).
   *  Drives the cheapest-pharmacy ranking and the "with COUPON" secondary
   *  line on the price card. */
  baseSellingPrice?: number | null;
  baseDiscountPercent?: number | null;
  couponCode?: string | null;
  couponMinCart?: number | null;
  couponAppOnly?: boolean | null;
  couponFinalPrice?: number | null;
  locationPrice?: number | null;
  serviceable?: boolean | null;
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
  description?: string | null;
  ingredients?: string | null;
  listings: Listing[];
  saltMappings: SaltMapping[];
  drugDetail?: DrugDetail | null;
  /** Pack counts the server saw across catalog-matched listings for this
   *  medicine — used to populate the pack-size selector. */
  availablePackSizes?: number[];
}

interface SearchResponse {
  medicine: MedicineData | null;
  cached?: boolean;
  stale?: boolean;
  message?: string;
  searchLogId?: string | null;
}

interface Props {
  medicineId?: string;
  query?: string;
}

// Pharmacies we expect to hear from. Used to render skeleton cards while a
// streaming search is in flight. Kept in sync with `SCRAPERS` in lib/scrapers.
// Apollo runs only in the cron worker (browser-based), so we don't expect it
// to respond on Vercel — keep it out of the skeleton set.
const EXPECTED_PHARMACIES = [
  "1mg",
  "pharmeasy",
  "netmeds",
  "truemeds",
  "mrmed",
];

// Module-level memory cache so navigating away and back to the same medicine
// (within the user's session) renders instantly without hitting the network.
const CLIENT_CACHE = new Map<string, { data: SearchResponse; ts: number }>();
const CLIENT_TTL_MS = 5 * 60 * 1000;

export function ResultsView({ medicineId, query }: Props) {
  // Once `medicine` is non-null we stop showing the full-page loading state.
  // Per-pharmacy skeletons cover the partial-results phase.
  const [medicine, setMedicine] = useState<MedicineData | null>(null);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searchLogId, setSearchLogId] = useState<string | null>(null);
  const [pendingPharmacies, setPendingPharmacies] = useState<Set<string>>(
    () => new Set(EXPECTED_PHARMACIES)
  );
  const [streamDone, setStreamDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storePanelOpen, setStorePanelOpen] = useState(false);
  const [showOos, setShowOos] = useState(false);
  // null until the user picks one (or we derive a single canonical size).
  const [packSize, setPackSize] = useState<number | null>(null);
  // Sizes the server saw across catalog-matched listings — drives the
  // dropdown. Empty until the stream's "done" chunk arrives (or the
  // cached-response JSON parses).
  const [availablePackSizes, setAvailablePackSizes] = useState<number[]>([]);
  const { location, ready: locationReady } = useLocation();
  const cancelledRef = useRef(false);

  const runSearch = useCallback(
    async (opts: { refresh?: boolean } = {}) => {
      const params = new URLSearchParams();
      if (medicineId) params.set("medicineId", medicineId);
      else if (query) params.set("q", query);
      if (location?.pincode) params.set("pincode", location.pincode);
      if (opts.refresh) params.set("refresh", "1");
      // No packSize on the URL — the server returns every (pharmacy, pack)
      // variant for this medicine and the client filters by the user's
      // selector pick locally, with no refetch on toggle.

      const cacheKey = params.toString();

      // Client-side memory cache hit — render instantly, skip network entirely.
      if (!opts.refresh) {
        const hit = CLIENT_CACHE.get(cacheKey);
        if (hit && Date.now() - hit.ts < CLIENT_TTL_MS) {
          setMedicine(hit.data.medicine);
          setStale(!!hit.data.stale);
          setMessage(hit.data.message ?? null);
          setPendingPharmacies(new Set());
          setStreamDone(true);
          setError(null);
          return;
        }
      }

      // Reset state for a fresh search. We always clear the "stream done"
      // signal and the pending pharmacy set so the cheapest-price badge
      // and price-sorted ordering don't apply until the new stream finishes.
      if (opts.refresh) {
        setRefreshing(true);
      } else {
        setMedicine(null);
      }
      setStreamDone(false);
      setPendingPharmacies(new Set(EXPECTED_PHARMACIES));
      setAvailablePackSizes([]);
      setMessage(null);
      setError(null);
      setSearchLogId(null);

      try {
        const r = await apiFetch(`/api/search?${params}`, {
          headers: { Accept: "application/x-ndjson" },
        });
        if (!r.ok) throw new Error(`Search failed: ${r.status}`);

        const contentType = r.headers.get("content-type") ?? "";
        if (!contentType.includes("ndjson") || !r.body) {
          // Server returned plain JSON (FRESH/STALE cache hit). Render it
          // as a single shot — equivalent to streamDone.
          const d: SearchResponse = await r.json();
          if (cancelledRef.current) return;
          setMedicine(d.medicine);
          setStale(!!d.stale);
          setMessage(d.message ?? null);
          setSearchLogId(d.searchLogId ?? null);
          setPendingPharmacies(new Set());
          setStreamDone(true);
          if (
            d.medicine &&
            Array.isArray(d.medicine.availablePackSizes)
          ) {
            setAvailablePackSizes(d.medicine.availablePackSizes);
          }
          CLIENT_CACHE.set(cacheKey, { data: d, ts: Date.now() });
          return;
        }

        // Streaming path — parse NDJSON line-by-line.
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const aggregatedListings: Listing[] = [];
        let finalMedicine: MedicineData | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;

            let msg: any;
            try {
              msg = JSON.parse(line);
            } catch {
              continue;
            }
            if (cancelledRef.current) return;

            if (msg.type === "medicine") {
              finalMedicine = msg.medicine;
              setMedicine(msg.medicine);
              setStale(!!msg.stale);
              if (msg.searchLogId) setSearchLogId(msg.searchLogId);
            } else if (msg.type === "listing") {
              setPendingPharmacies((prev) => {
                if (!prev.has(msg.pharmacy)) return prev;
                const next = new Set(prev);
                next.delete(msg.pharmacy);
                return next;
              });
              if (Array.isArray(msg.listings) && msg.listings.length > 0) {
                // Tag each new listing as awaiting live serviceability so
                // PriceCard can render "checking delivery…" until the
                // matching {type:"serviceability"} chunk arrives.
                const marked = msg.listings.map((l: Listing) => ({
                  ...l,
                  etaPending: true,
                }));
                aggregatedListings.push(...marked);
                setMedicine((prev) =>
                  prev
                    ? {
                        ...prev,
                        listings: mergeListingsByPharmacy(
                          prev.listings,
                          marked
                        ),
                      }
                    : prev
                );
              }
            } else if (msg.type === "serviceability") {
              // Merge live ETA / stock / price into the existing listing.
              const updateFn = (l: Listing) =>
                l.id === msg.listingId
                  ? {
                      ...l,
                      etaPending: false,
                      inStock:
                        typeof msg.inStock === "boolean" ? msg.inStock : l.inStock,
                      deliveryEta: msg.deliveryEta ?? null,
                      sellingPrice:
                        msg.sellingPrice ?? l.sellingPrice ?? null,
                      mrp: msg.mrp ?? l.mrp ?? null,
                    }
                  : l;
              for (let i = 0; i < aggregatedListings.length; i++) {
                aggregatedListings[i] = updateFn(aggregatedListings[i]);
              }
              setMedicine((prev) =>
                prev
                  ? { ...prev, listings: prev.listings.map(updateFn) }
                  : prev
              );
            } else if (msg.type === "done") {
              setStreamDone(true);
              setPendingPharmacies(new Set());
              if (Array.isArray(msg.availablePackSizes)) {
                setAvailablePackSizes(msg.availablePackSizes);
              }
            }
          }
        }

        // Cache the final assembled result so back/forward nav is instant.
        if (finalMedicine) {
          const finalData: SearchResponse = {
            medicine: { ...finalMedicine, listings: aggregatedListings },
            stale: false,
          };
          CLIENT_CACHE.set(cacheKey, { data: finalData, ts: Date.now() });
        }
      } catch (err: any) {
        if (!cancelledRef.current) setError(err?.message ?? "Search failed");
      } finally {
        if (!cancelledRef.current) {
          setRefreshing(false);
        }
      }
    },
    [medicineId, query, location?.pincode]
  );

  useEffect(() => {
    if (!locationReady) return;
    cancelledRef.current = false;
    runSearch();
    return () => {
      cancelledRef.current = true;
    };
  }, [runSearch, locationReady]);

  // Default selection is "All" (packSize=null). The selector options are
  // driven entirely by availablePackSizes the server emitted, so users
  // never see a hard-coded size that doesn't exist for this medicine.

  const initialLoading = !medicine && !error;
  const rawListings = medicine?.listings ?? [];
  // Client-side pack-size filter. When packSize is null ("All") nothing is
  // narrowed. When a size is picked, listings whose parseable pack count
  // doesn't match are hidden — listings with an unknown count are kept
  // (better to show with a chip than disappear).
  const allListings = useMemo(() => {
    if (packSize == null) return rawListings;
    return rawListings.filter((l) => {
      const n = extractPackCount(l.productName, l.packSize ?? null);
      return n == null || n === packSize;
    });
  }, [rawListings, packSize]);
  const inStockListingsArrivalOrder = allListings.filter((l) => l.inStock);
  const oosListings = allListings.filter((l) => !l.inStock);
  const respondedPharmacies = new Set(
    rawListings.map((l) => l.pharmacyName)
  );
  // Pharmacies that have at least one catalog-matched listing but none
  // matching the currently-selected pack size. Rendered as a muted "no
  // pack of N at this pharmacy" card so the user sees we checked.
  const filteredOutPharmacies = useMemo(() => {
    if (packSize == null) return [] as string[];
    const visible = new Set(allListings.map((l) => l.pharmacyName));
    return Array.from(respondedPharmacies).filter((p) => !visible.has(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allListings, rawListings, packSize]);
  const stillPending = Array.from(pendingPharmacies).filter(
    (p) => !respondedPharmacies.has(p)
  );

  // While pharmacies are still streaming in, we keep listings in arrival
  // order and DON'T highlight a "cheapest" — otherwise the crown would jump
  // from card to card as cheaper results land. Once the stream is `done`
  // (all pharmacies have responded), we sort by price and mark the real
  // cheapest with the Best Online Price badge.
  // Rank by UNCONDITIONAL price (baseSellingPrice ?? sellingPrice). Pharmeasy's
  // `sellingPrice` already bakes in its best conditional coupon (cart ≥ ₹1000,
  // app-only), so sorting purely by `sellingPrice` puts it artificially first.
  const effectivePrice = (l: Listing) =>
    l.baseSellingPrice ?? l.sellingPrice ?? l.mrp ?? Infinity;
  const inStockListings = streamDone
    ? [...inStockListingsArrivalOrder].sort(
        (a, b) => effectivePrice(a) - effectivePrice(b)
      )
    : inStockListingsArrivalOrder;

  const cheapest = streamDone
    ? inStockListings.find(
        (l) => (l.baseSellingPrice ?? l.sellingPrice) != null
      )
    : null;
  const cheapestPrice = cheapest
    ? cheapest.baseSellingPrice ?? cheapest.sellingPrice ?? null
    : null;
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
      {initialLoading && (
        <div className="space-y-3">
          {EXPECTED_PHARMACIES.map((p, i) => (
            <PriceCardSkeleton key={p} pharmacyName={p} index={i} />
          ))}
        </div>
      )}

      {error && (
        <div className="glass-card p-8 flex items-start gap-3 text-red-300">
          <AlertCircle size={20} />
          <div>
            <div className="font-semibold">Something went wrong</div>
            <div className="text-sm text-text-secondary mt-1">{error}</div>
          </div>
        </div>
      )}

      {!initialLoading && !error && !medicine && (
        <div className="glass-card p-12 text-center">
          <Pill size={32} className="mx-auto mb-4 text-text-muted" />
          <h2 className="font-display font-bold text-xl mb-2">No results</h2>
          <p className="text-text-secondary text-sm">
            We couldn&apos;t find this medicine in any of the 6 pharmacies right
            now.
          </p>
        </div>
      )}

      {medicine && (
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
              {medicine.drugDetail &&
                medicine.drugDetail.soldOnline === false && (
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
            {availablePackSizes.length >= 2 && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-text-muted">
                  Pack size
                </span>
                <div className="inline-flex rounded-full bg-overlay-5 border border-overlay-10 p-0.5">
                  {([null, ...availablePackSizes] as (number | null)[]).map(
                    (n) => {
                      const active = packSize === n;
                      const label = n == null ? "All" : String(n);
                      return (
                        <button
                          key={label}
                          onClick={() => {
                            if (!active) setPackSize(n);
                          }}
                          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                            active
                              ? "bg-purple-500/30 text-white"
                              : "text-text-secondary hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            )}
            {stale && (
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
                        <>
                          The same molecule is available at a government store
                          near you.
                        </>
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
            {/* Real listings (in stock) */}
            {inStockListings.map((l, i) => (
              <PriceCard
                key={l.id}
                listing={l}
                medicineId={medicine.id}
                isCheapest={l.id === cheapest?.id}
                index={i}
                searchLogId={searchLogId}
                position={i + 1}
              />
            ))}

            {/* Skeletons for pharmacies still in flight */}
            {stillPending.map((p, i) => (
              <PriceCardSkeleton
                key={`pending-${p}`}
                pharmacyName={p}
                index={inStockListings.length + i}
              />
            ))}

            {/* Pharmacies that returned a listing for this medicine but
                none in the currently-selected pack size. Derived locally
                from rawListings so toggling the selector updates these
                cards without a network round-trip. */}
            {filteredOutPharmacies.map((p) => (
              <div
                key={`empty-${p}`}
                className="glass-card p-5 flex items-center gap-4 opacity-60"
              >
                <span className="pharmacy-badge border bg-overlay-5 text-text-secondary border-overlay-10">
                  {p}
                </span>
                <span className="text-sm text-text-muted">
                  No pack of {packSize} found at this pharmacy
                </span>
              </div>
            ))}

            {/* "No results" block — only show after the stream is done and
                we got nothing relevant. */}
            {streamDone &&
              allListings.length === 0 &&
              stillPending.length === 0 && (
                <div className="glass-card p-8 text-center">
                  {medicine.drugDetail?.soldOnline === false ? (
                    <>
                      <ShieldX size={28} className="mx-auto mb-3 text-red-300" />
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
                  ) : message ? (
                    <div className="text-text-secondary text-sm leading-relaxed max-w-md mx-auto">
                      {message}
                    </div>
                  ) : (
                    <div className="text-text-secondary text-sm leading-relaxed max-w-md mx-auto">
                      No live pharmacy listings yet. Our scrapers couldn&apos;t
                      find it. Try again in a moment.
                    </div>
                  )}
                </div>
              )}

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
                  {oosListings.length}{" "}
                  {oosListings.length === 1 ? "pharmacy" : "pharmacies"} out of
                  stock
                </button>
                {showOos &&
                  oosListings.map((l, i) => (
                    <PriceCard
                      key={l.id}
                      listing={l}
                      medicineId={medicine.id}
                      isCheapest={false}
                      index={inStockListings.length + i}
                      searchLogId={searchLogId}
                      position={inStockListings.length + i + 1}
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Drug Information ("About") Section */}
          <DrugInfo
            manufacturer={medicine.manufacturer}
            saltComposition={medicine.saltComposition}
            ingredients={medicine.ingredients}
            category={medicine.category}
            description={medicine.description}
            uses={medicine.drugDetail?.uses}
            howItWorks={medicine.drugDetail?.howItWorks}
            sideEffects={medicine.drugDetail?.sideEffects}
            warnings={medicine.drugDetail?.warnings}
            storage={medicine.drugDetail?.storage}
          />

          {/* Alternatives Section */}
          <Alternatives
            medicineId={medicine.id}
            saltComposition={medicine.saltComposition}
            cheapestPharmacy={cheapest?.pharmacyName ?? null}
          />
        </>
      )}

      <StoreLocatorPanel
        open={storePanelOpen}
        onClose={() => setStorePanelOpen(false)}
      />
    </div>
  );
}

/**
 * Merge a new batch of listings (all from one pharmacy) into the existing
 * list. Replaces any prior entries for that pharmacy so a stream chunk
 * overrides anything the cached "medicine" chunk may have included.
 */
function mergeListingsByPharmacy(
  existing: Listing[],
  incoming: Listing[]
): Listing[] {
  if (incoming.length === 0) return existing;
  const incomingPharmacies = new Set(incoming.map((l) => l.pharmacyName));
  const kept = existing.filter((l) => !incomingPharmacies.has(l.pharmacyName));
  return [...kept, ...incoming];
}
