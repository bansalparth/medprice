"use client";

import { ThemeProvider } from "next-themes";
import { LocationProvider } from "@/lib/location-context";
import { LocationGate } from "@/components/LocationGate";
import { LocationPicker } from "@/components/LocationPicker";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <LocationProvider>
        <LocationGate>{children}</LocationGate>
        <LocationPicker />
      </LocationProvider>
    </ThemeProvider>
  );
}
