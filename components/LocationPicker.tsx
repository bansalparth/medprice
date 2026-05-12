"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Search, Loader2, X, Crosshair } from "lucide-react";
import { useLocation, type LocationSearchResult } from "@/lib/location-context";

/**
 * Floating location picker. Opens via Header or LocationGate.
 *
 * Two flows:
 *   1. "Use my current location" — geolocation permission
 *   2. Search box — debounced Nominatim "places in India" autocomplete
 */
export function LocationPicker() {
  const {
    open,
    closePicker,
    request,
    loading,
    error,
    location,
    setManual,
    searchPlaces,
  } = useLocation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Snapshot of the location at the moment the picker opened. We auto-close only
  // when the location *changes* (user picked something new) — never just because
  // they had a location set when opening it.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setOpenedAt(location?.capturedAt ?? 0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open, location?.capturedAt]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchPlaces(q);
      if (!cancelled) {
        setResults(r);
        setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open, searchPlaces]);

  // Only auto-close after the user actually picks/captures a *new* location.
  useEffect(() => {
    if (
      open &&
      location &&
      !loading &&
      !error &&
      openedAt != null &&
      location.capturedAt > openedAt
    ) {
      closePicker();
    }
  }, [open, location, loading, error, closePicker, openedAt]);

  const choose = (r: LocationSearchResult) => {
    setManual(r);
    closePicker();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closePicker}
          className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-20"
          style={{
            background: "rgba(6,4,13,0.78)",
            backdropFilter: "blur(8px)",
          }}
        >
          <motion.div
            initial={{ y: -10, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-card-static w-full max-w-lg p-5 relative"
          >
            <button
              onClick={closePicker}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-overlay-10 text-text-muted hover:text-silver-100 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <MapPin size={16} className="text-silver-100" />
              </div>
              <div>
                <div className="font-display font-bold text-base">
                  Choose your location
                </div>
                <div className="text-[11px] text-text-muted">
                  Prices, stock and delivery dates change by city.
                </div>
              </div>
            </div>

            <button
              onClick={request}
              disabled={loading}
              className="w-full py-2.5 px-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 flex items-center justify-center gap-2 text-sm font-medium transition-colors disabled:opacity-60 mb-3"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Crosshair size={14} className="text-purple-300" />
              )}
              Use my current location
            </button>

            {error && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search city, area or pincode..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--bg-secondary)]/60 border border-overlay-10 focus:border-purple-400/60 focus:outline-none text-sm placeholder:text-text-muted"
              />
            </div>

            {(searching || results.length > 0) && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-overlay-5 bg-[var(--bg-primary)]/60">
                {searching && results.length === 0 && (
                  <div className="px-3 py-3 text-xs text-text-muted flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" />
                    Searching...
                  </div>
                )}
                {results.map((r, i) => (
                  <button
                    key={`${r.lat}-${r.lng}-${i}`}
                    onClick={() => choose(r)}
                    className="w-full text-left px-3 py-2.5 hover:bg-purple-500/10 border-b border-overlay-5 last:border-0 transition-colors"
                  >
                    <div className="text-sm font-medium truncate">
                      {r.city ?? r.display.split(",")[0]}
                      {r.pincode && (
                        <span className="ml-2 text-[10px] text-purple-300 font-mono">
                          {r.pincode}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-muted truncate">
                      {r.display}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {location && (
              <div className="mt-4 text-[11px] text-text-muted">
                Currently:{" "}
                <span className="text-text-secondary">
                  {location.city ??
                    location.state ??
                    (location.pincode
                      ? location.pincode
                      : `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`)}
                  {location.pincode && location.city && ` · ${location.pincode}`}
                </span>
                {!location.city && !location.pincode && (
                  <span className="ml-1">
                    — couldn&apos;t resolve to a city. Type yours above.
                  </span>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
