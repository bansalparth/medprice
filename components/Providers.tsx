"use client";

import { LocationProvider } from "@/lib/location-context";
import { LocationGate } from "@/components/LocationGate";
import { LocationPicker } from "@/components/LocationPicker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocationProvider>
      <LocationGate>{children}</LocationGate>
      <LocationPicker />
    </LocationProvider>
  );
}
