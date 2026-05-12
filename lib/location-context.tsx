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
  /**
   * True once the initial localStorage hydration has completed.
   * Consumers that fetch based on `location.pincode` should wait until
   * `ready` is true to avoid firing twice (once without pincode, once with).
   */
  ready: boolean;
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

interface ReverseResult {
  pincode: string | null;
  city: string | null;
  state: string | null;
}

async function reverseViaPhoton(lat: number, lng: number): Promise<ReverseResult | null> {
  // Photon reliably returns BOTH `city` and `postcode` for Indian
  // coordinates, unlike Nominatim's /reverse at zoom=14 which omits
  // postcode. CORS is open; the User-Agent header isn't needed (browsers
  // silently strip it anyway).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    const f =
      features.find((x: any) => x?.properties?.countrycode === "IN") ??
      features[0];
    const p = f?.properties ?? {};
    return {
      pincode: p.postcode ?? null,
      city:
        p.city ?? p.district ?? p.county ?? p.locality ?? p.name ?? null,
      state: p.state ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function reverseViaNominatim(lat: number, lng: number): Promise<ReverseResult | null> {
  // Fallback used only when Photon returns empty. Nominatim's `reverse`
  // omits postcode at zoom=14, so we use zoom=16 (street level) which is
  // more likely to include it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address ?? {};
    return {
      pincode: a.postcode ?? null,
      city: a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? null,
      state: a.state ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  // Try Photon first (better Indian data), fall back to Nominatim if Photon
  // returns nothing useful. Always return *something* so the caller can
  // still persist the lat/lng even when reverse geocoding fails entirely.
  const photon = await reverseViaPhoton(lat, lng);
  if (photon && (photon.city || photon.pincode)) return photon;
  const nominatim = await reverseViaNominatim(lat, lng);
  if (nominatim && (nominatim.city || nominatim.pincode)) return nominatim;
  return photon ?? nominatim ?? { pincode: null, city: null, state: null };
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from storage on mount
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
    } finally {
      setReady(true);
    }
  }, []);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation isn't supported by this browser.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const { pincode, city, state } = await reverseGeocode(lat, lng);
        const next: UserLocation = {
          lat,
          lng,
          pincode,
          city,
          state,
          capturedAt: Date.now(),
        };
        setLocation(next);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            "Location permission denied. Enable it in your browser settings to use MedPrice."
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Could not determine your location. Try again in a moment.");
        } else {
          setError("Location request timed out. Please try again.");
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 }
    );
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

  /**
   * High-quality location autocomplete for India.
   *
   *   - All-digit input (3-6 chars) → official postalpincode.in API.
   *     Returns every post office under that pincode.
   *   - Text input → Photon (Komoot, OSM-based, free, no key). Far better
   *     ranked than raw Nominatim and has India bias when biased by lat/lon.
   *
   * Both paths normalise to LocationSearchResult so the picker UI is unchanged.
   */
  const searchPlaces = useCallback(
    async (q: string): Promise<LocationSearchResult[]> => {
      const query = q.trim();
      if (query.length < 2) return [];

      // Numeric → IN pincode service
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
            // postalpincode.in doesn't return coords; centroid lookup happens
            // implicitly when the user picks (we keep 0/0 sentinels here and
            // backfill later if ever needed)
            lat: 0,
            lng: 0,
          }));
        } catch {
          return [];
        }
      }

      // Text → Photon, biased to India
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

  const [open, setOpen] = useState(false);
  const openPicker = useCallback(() => setOpen(true), []);
  const closePicker = useCallback(() => setOpen(false), []);

  return (
    <LocationCtx.Provider
      value={{
        location,
        ready,
        loading,
        error,
        request,
        clear,
        refresh: request,
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
