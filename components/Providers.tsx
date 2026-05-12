"use client";

import { ThemeProvider } from "next-themes";
import { LocationProvider } from "@/lib/location-context";
import { LocationGate } from "@/components/LocationGate";
import { LocationPicker } from "@/components/LocationPicker";
import { TrackingProvider } from "@/components/TrackingProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <LocationProvider>
        <TrackingProvider>
          <LocationGate>{children}</LocationGate>
          <LocationPicker />
        </TrackingProvider>
      </LocationProvider>
    </ThemeProvider>
  );
}
