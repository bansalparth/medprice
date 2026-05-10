"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface UserLocation {
  lat: number;
  lng: number;
  pincode: string | null;
  city: string | null;
  state: string | null;
  capturedAt: number;
}

export interface LocationSearchResult {
  display: string;
  pincode: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
}

interface LocationCtxValue {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  request: () => void;
  clear: () => void;
  refresh: () => void;
  setManual: (r: LocationSearchResult) => void;
  searchPlaces: (q: string) => Promise<LocationSearchResult[]>;
  open: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

const LocationCtx = createContext<LocationCtxValue | null>(null);
const STORAGE_KEY = "medprice_location_v1";
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UserLocation;
        if (Date.now() - parsed.capturedAt < STALE_MS) {
          setLocation(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const [open, setOpen] = useState(false);
  const openPicker = useCallback(() => setOpen(true), []);
  const closePicker = useCallback(() => setOpen(false), []);

  const request = useCallback(() => {
    setOpen(true);
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setLocation(null);
  }, []);

  const setManual = useCallback((r: LocationSearchResult) => {
    const next: UserLocation = {
      lat: r.lat,
      lng: r.lng,
      pincode: r.pincode,
      city: r.city,
      state: r.state,
      capturedAt: Date.now(),
    };
    setLocation(next);
    setError(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const searchPlaces = useCallback(
    async (q: string): Promise<LocationSearchResult[]> => {
      const query = q.trim();
      if (query.length < 2) return [];

      if (/^\d{3,6}$/.test(query)) {
        try {
          const res = await fetch(
            `https://api.postalpincode.in/pincode/${query}`
          );
          if (!res.ok) return [];
          const data = await res.json();
          const offices = data?.[0]?.PostOffice;
          if (!Array.isArray(offices)) return [];
          return offices.slice(0, 8).map((po: any) => ({
            display: `${po.Name}, ${po.District}, ${po.State} ${po.Pincode}`,
            pincode: String(po.Pincode),
            city: po.District ?? po.Name ?? null,
            state: po.State ?? null,
            lat: 0,
            lng: 0,
          }));
        } catch {
          return [];
        }
      }

      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
        query
      )}&limit=8&lang=en&lat=22.5&lon=78.9&zoom=4`;
      try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        return features
          .filter((f: any) => f?.properties?.countrycode === "IN")
          .slice(0, 8)
          .map((f: any) => {
            const p = f.properties ?? {};
            const [lng, lat] = f.geometry?.coordinates ?? [0, 0];
            const parts = [
              p.name,
              p.city ?? p.district ?? p.county,
              p.state,
              p.postcode,
            ].filter(Boolean);
            return {
              display: parts.join(", "),
              pincode: p.postcode ?? null,
              city: p.city ?? p.district ?? p.county ?? p.name ?? null,
              state: p.state ?? null,
              lat,
              lng,
            };
          });
      } catch {
        return [];
      }
    },
    []
  );

  return (
    <LocationCtx.Provider
      value={{
        location,
        loading,
        error,
        request,
        clear,
        refresh: openPicker,
        setManual,
        searchPlaces,
        open,
        openPicker,
        closePicker,
      }}
    >
      {children}
    </LocationCtx.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationCtx);
  if (!ctx) throw new Error("useLocation must be used inside LocationProvider");
  return ctx;
}
