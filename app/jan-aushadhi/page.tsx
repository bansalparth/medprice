"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { apiFetch } from "@/lib/api-client";
import { motion } from "framer-motion";
import { MapPin, Navigation, Search, Loader2 } from "lucide-react";
import { AvailabilityWarning } from "@/components/results/AvailabilityWarning";
import { useLocation } from "@/lib/location-context";
import { trackLocatorAction } from "@/lib/tracking-client";

interface Store {
  id: string;
  kendraId: string;
  state?: string | null;
  district?: string | null;
  address?: string | null;
  pincode?: string | null;
  contactPerson?: string | null;
  contactDetails?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number;
}

interface Regions {
  states: string[];
  districtsByState: Record<string, string[]>;
}

/**
 * Case-insensitive lookup of a dropdown value. Returns the canonical
 * option from `list` whose lowercase form matches `value`, or "" if none.
 * Used to pre-fill the dropdowns from the location context — the context
 * may carry "bengaluru" while the DB stores "Bengaluru".
 */
function findCanonical(list: string[], value: string | null | undefined): string {
  if (!value) return "";
  const lc = value.toLowerCase();
  return list.find((v) => v.toLowerCase() === lc) ?? "";
}

export default function JanAushadhiPage() {
  const { location } = useLocation();
  const [regions, setRegions] = useState<Regions | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [loading, setLoading] = useState(false);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [usingLocation, setUsingLocation] = useState(false);

  // Fetch state/district options once
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/stores/regions")
      .then((r) => r.json())
      .then((d: Regions) => {
        if (cancelled) return;
        setRegions(d);
      })
      .finally(() => {
        if (!cancelled) setRegionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fill from location context once regions are loaded
  useEffect(() => {
    if (!regions || !location) return;
    if (state) return; // user already picked
    const s = findCanonical(regions.states, location.state);
    if (!s) return;
    setState(s);
    const ds = regions.districtsByState[s] ?? [];
    const d = findCanonical(ds, location.city);
    if (d) setDistrict(d);
  }, [regions, location, state]);

  const districtOptions = useMemo(() => {
    if (!regions || !state) return [];
    return regions.districtsByState[state] ?? [];
  }, [regions, state]);

  const search = async () => {
    if (!state) {
      setStores([]);
      return;
    }
    setLoading(true);
    setUsingLocation(false);
    try {
      const params = new URLSearchParams();
      params.set("state", state);
      if (district) params.set("district", district);
      const res = await apiFetch(`/api/stores/search?${params}`);
      const data = await res.json();
      const found = data.stores ?? [];
      setStores(found);
      trackLocatorAction("search", {
        state,
        district: district || null,
        results: found.length,
      });
    } finally {
      setLoading(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLoading(true);
    setUsingLocation(true);
    trackLocatorAction("geo_request", {});
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await apiFetch(
            `/api/stores/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&limit=20`
          );
          const data = await res.json();
          const found = data.stores ?? [];
          setStores(found);
          const nearestKm =
            found[0]?.distanceKm != null
              ? Number(found[0].distanceKm.toFixed(2))
              : null;
          trackLocatorAction("geo_results", {
            results: found.length,
            nearestKm,
          });
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setUsingLocation(false);
        trackLocatorAction("geo_denied", {});
      }
    );
  };

  // Auto-search once dropdowns are pre-filled from the context.
  useEffect(() => {
    if (!regions) return;
    if (!state) return;
    search();
    // Run only when state/district change AFTER regions arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, district, regions]);

  const onStateChange = (v: string) => {
    setState(v);
    setDistrict(""); // reset district when state changes
  };

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="font-display font-bold text-4xl mb-2">
            Jan Aushadhi <span className="gradient-text-green">Stores</span>
          </h1>
          <p className="text-text-secondary">
            Government-run generic medicine stores. Same molecule, 50–90% cheaper.
          </p>
        </motion.div>

        <AvailabilityWarning className="mb-6" />

        <div className="glass-card p-5 mb-8">
          <div className="grid md:grid-cols-3 gap-3">
            <select
              value={state}
              onChange={(e) => onStateChange(e.target.value)}
              disabled={regionsLoading}
              className="px-4 py-2.5 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400 disabled:opacity-50"
              aria-label="State"
            >
              <option value="">
                {regionsLoading ? "Loading states..." : "Choose state"}
              </option>
              {regions?.states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              disabled={!state}
              className="px-4 py-2.5 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400 disabled:opacity-50"
              aria-label="District"
            >
              <option value="">
                {state ? "All districts" : "Pick a state first"}
              </option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button
              onClick={search}
              disabled={!state || loading}
              className="px-4 py-2.5 rounded-xl bg-purple-400 text-ink-950 font-semibold text-sm hover:bg-purple-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Search size={14} /> Search
            </button>
          </div>
          <div className="mt-3 text-center">
            <button
              onClick={useMyLocation}
              className="text-sm text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1.5"
            >
              <Navigation size={13} />
              Find nearest stores using my location
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-16">
            <Loader2 className="mx-auto animate-spin text-purple-400" />
          </div>
        )}

        {!loading && stores.length === 0 && (
          <div className="glass-card p-10 text-center text-text-secondary">
            {state
              ? "No stores match your filters."
              : "Pick a state to see Jan Aushadhi Kendras."}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          {stores.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03 }}
              className="glass-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {s.district}, {s.state}
                  </div>
                  <div className="text-xs text-text-secondary mt-1 line-clamp-2">
                    {s.address}
                  </div>
                  <div className="text-[11px] text-text-muted mt-1 flex flex-wrap gap-x-3">
                    <span>Kendra {s.kendraId}</span>
                    {s.pincode && <span>· {s.pincode}</span>}
                    {s.contactDetails && (
                      <a
                        href={`tel:${s.contactDetails.replace(/[^\d+]/g, "")}`}
                        className="text-purple-300 hover:text-purple-200"
                      >
                        · {s.contactDetails}
                      </a>
                    )}
                  </div>
                </div>
                {usingLocation && s.distanceKm != null && (
                  <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-[11px] font-medium shrink-0">
                    {s.distanceKm.toFixed(1)} km
                  </span>
                )}
              </div>
              {s.lat && s.lng && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300"
                >
                  <MapPin size={13} /> Directions
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </main>
    </>
  );
}
