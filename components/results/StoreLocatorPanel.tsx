"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Navigation, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useLocation } from "@/lib/location-context";

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

export function StoreLocatorPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { location } = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    if (!open) return;
    if (stores.length > 0) return;
    if (!location) {
      setError("Set your city to find nearby stores.");
      return;
    }

    setLoading(true);
    setError(null);

    const fetchStores = async () => {
      try {
        let res: Response;
        if (location.lat && location.lng && (location.lat !== 0 || location.lng !== 0)) {
          res = await apiFetch(
            `/api/stores/nearby?lat=${location.lat}&lng=${location.lng}&limit=5`
          );
        } else {
          const params = new URLSearchParams();
          if (location.city) params.set("district", location.city);
          if (location.state) params.set("state", location.state);
          res = await apiFetch(`/api/stores/search?${params}`);
        }
        const data = await res.json();
        setStores(data.stores ?? []);
      } catch {
        setError("Could not load stores.");
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, [open, stores.length, location]);

  const cityLabel = location?.city ?? location?.state ?? "your area";

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
            <div className="sticky top-0 bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-overlay-5 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-lg">
                  Stores in {cityLabel}
                </h2>
                <p className="text-xs text-text-secondary">Jan Aushadhi Kendras</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-overlay-5 text-text-secondary hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              {loading && (
                <div className="text-center py-12">
                  <Loader2 className="mx-auto mb-3 animate-spin text-purple-400" />
                  <p className="text-text-secondary text-sm">
                    Finding stores...
                  </p>
                </div>
              )}

              {error && (
                <div className="text-center py-8 text-red-400 text-sm">{error}</div>
              )}

              {!loading && !error && stores.length === 0 && (
                <div className="text-center py-8 text-text-secondary text-sm">
                  No Jan Aushadhi stores found in {cityLabel}.
                </div>
              )}

              <div className="space-y-3">
                {stores.map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="glass-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {s.district}, {s.state}
                        </div>
                        <div className="text-xs text-text-secondary mt-1">
                          {s.address}
                        </div>
                        {s.contactPerson && (
                          <div className="text-[11px] text-text-muted mt-1">
                            {s.contactPerson}
                            {s.contactDetails && ` · ${s.contactDetails}`}
                          </div>
                        )}
                      </div>
                      {s.distanceKm != null && (
                        <span className="px-2 py-1 rounded-full bg-accent-green/10 text-accent-green text-[11px] font-medium shrink-0">
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
                        <Navigation size={13} /> Directions
                      </a>
                    )}
                  </motion.div>
                ))}
              </div>

              {location && (
                <p className="mt-6 text-[11px] text-text-muted text-center flex items-center justify-center gap-1">
                  <MapPin size={11} /> Showing stores for: {location.city ?? location.pincode ?? "—"}
                  {location.state && `, ${location.state}`}
                </p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
