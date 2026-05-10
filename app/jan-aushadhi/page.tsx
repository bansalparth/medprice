"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { apiFetch } from "@/lib/api-client";
import { motion } from "framer-motion";
import { MapPin, Navigation, Search, Loader2 } from "lucide-react";

interface Store {
  id: string;
  kendraId: string;
  state?: string | null;
  district?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number;
}

export default function JanAushadhiPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [loading, setLoading] = useState(false);
  const [usingLocation, setUsingLocation] = useState(false);

  const search = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      if (district) params.set("district", district);
      const res = await apiFetch(`/api/stores/search?${params}`);
      const data = await res.json();
      setStores(data.stores ?? []);
    } finally {
      setLoading(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLoading(true);
    setUsingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await apiFetch(
            `/api/stores/nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&limit=20`
          );
          const data = await res.json();
          setStores(data.stores ?? []);
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setUsingLocation(false);
      }
    );
  };

  useEffect(() => {
    search();
  }, []);

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

        <div className="glass-card p-5 mb-8">
          <div className="grid md:grid-cols-3 gap-3">
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State (e.g. Karnataka)"
              className="px-4 py-2.5 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400"
            />
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="District (e.g. Bengaluru)"
              className="px-4 py-2.5 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400"
            />
            <button
              onClick={search}
              className="px-4 py-2.5 rounded-xl bg-purple-400 text-ink-950 font-semibold text-sm hover:bg-purple-300 transition-colors flex items-center justify-center gap-2"
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
            No stores found. Run{" "}
            <code className="text-purple-400">npm run seed:stores</code> to load
            Jan Aushadhi Kendras.
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
                  <div className="text-[11px] text-text-muted mt-1">
                    Kendra {s.kendraId}
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
