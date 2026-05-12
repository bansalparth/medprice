"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Navigation, Loader2, Phone, User, Hash } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { AvailabilityWarning } from "./AvailabilityWarning";

interface Store {
  id: string;
  kendraId: string;
  state?: string | null;
  district?: string | null;
  block?: string | null;
  address?: string | null;
  pincode?: string | null;
  contactPerson?: string | null;
  contactDetails?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number;
}

/** Build a clean, human-readable location line for the store card. */
function formatLocation(s: Store): string {
  // Prefer pincode when district looks like a garbage token (single short word).
  const district = (s.district ?? "").trim();
  const state = (s.state ?? "").trim();
  const looksLikeFragment =
    district.length > 0 && district.length < 4 && !/\d/.test(district);
  const parts: string[] = [];
  if (district && !looksLikeFragment) parts.push(district);
  if (state) parts.push(state);
  if (parts.length === 0 && s.pincode) parts.push(s.pincode);
  return parts.join(", ");
}

/** Build a clean address line (strips redundant duplicated tokens like "Shivamogga Shivamogga"). */
function formatAddress(s: Store): string {
  const a = (s.address ?? "").trim();
  if (!a) return "";
  // Collapse "X X" → "X" when the address is just one word duplicated.
  const tokens = a.split(/\s+/);
  if (tokens.length === 2 && tokens[0].toLowerCase() === tokens[1].toLowerCase()) {
    return tokens[0];
  }
  return a;
}

export function StoreLocatorPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locality, setLocality] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (stores.length > 0) return;

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }

    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        try {
          const res = await apiFetch(
            `/api/stores/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&limit=5`
          );
          const data = await res.json();
          setStores(data.stores ?? []);
          setLocality(data.locality ?? null);
        } catch {
          setError("Could not load stores.");
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setError(
          err.code === 1
            ? "Location permission denied. Enable it to find nearby stores."
            : "Could not get your location."
        );
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [open, stores.length]);

  const headerSubtitle = locality
    ? `Jan Aushadhi Kendras near ${locality}`
    : "Jan Aushadhi Kendras";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[var(--bg-primary)] border-l border-overlay-10 z-50 overflow-y-auto"
          >
            <div className="sticky top-0 bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-overlay-5 px-6 py-4 flex items-center justify-between z-10">
              <div className="min-w-0">
                <h2 className="font-display font-bold text-lg truncate">Nearby Stores</h2>
                <p className="text-xs text-text-secondary truncate">{headerSubtitle}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-overlay-5 text-text-secondary hover:text-white shrink-0"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {!loading && !error && stores.length > 0 && (
                <AvailabilityWarning compact className="mb-4" />
              )}
              {loading && (
                <div className="text-center py-12">
                  <Loader2 className="mx-auto mb-3 animate-spin text-purple-400" />
                  <p className="text-text-secondary text-sm">
                    Finding nearest stores...
                  </p>
                </div>
              )}

              {error && (
                <div className="text-center py-8 text-red-400 text-sm">{error}</div>
              )}

              {!loading && !error && stores.length === 0 && (
                <div className="text-center py-8 text-text-secondary text-sm">
                  No Jan Aushadhi Kendras found near your location.
                </div>
              )}

              <div className="space-y-3">
                {stores.map((s, i) => {
                  const loc = formatLocation(s);
                  const addr = formatAddress(s);
                  const mapsQuery =
                    s.lat && s.lng
                      ? `${s.lat},${s.lng}`
                      : encodeURIComponent(
                          [addr, loc, s.pincode].filter(Boolean).join(", ")
                        );
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass-card p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{loc || "Jan Aushadhi Kendra"}</div>
                          {addr && (
                            <div className="text-xs text-text-secondary mt-1 leading-relaxed">
                              {addr}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Hash size={10} /> {s.kendraId}
                            </span>
                            {s.pincode && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={10} /> {s.pincode}
                              </span>
                            )}
                          </div>
                          {(s.contactPerson || s.contactDetails) && (
                            <div className="mt-2 pt-2 border-t border-overlay-5 text-[11px] text-text-secondary space-y-0.5">
                              {s.contactPerson && (
                                <div className="flex items-center gap-1.5">
                                  <User size={10} className="text-text-muted" />
                                  <span className="truncate">{s.contactPerson}</span>
                                </div>
                              )}
                              {s.contactDetails && (
                                <a
                                  href={`tel:${s.contactDetails.replace(/[^\d+]/g, "")}`}
                                  className="flex items-center gap-1.5 text-purple-300 hover:text-purple-200"
                                >
                                  <Phone size={10} />
                                  <span>{s.contactDetails}</span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        {s.distanceKm != null && (
                          <span className="px-2 py-1 rounded-full bg-accent-green/10 text-accent-green text-[11px] font-medium shrink-0">
                            {s.distanceKm.toFixed(1)} km
                          </span>
                        )}
                      </div>
                      <a
                        href={
                          s.lat && s.lng
                            ? `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`
                            : `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300"
                      >
                        <Navigation size={13} /> Directions
                      </a>
                    </motion.div>
                  );
                })}
              </div>

              {coords && (
                <p className="mt-6 text-[11px] text-text-muted text-center flex items-center justify-center gap-1">
                  <MapPin size={11} /> Your location:{" "}
                  {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
