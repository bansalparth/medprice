"use client";

import Link from "next/link";
import { Pill, MapPin, ChevronDown } from "lucide-react";
import { useLocation } from "@/lib/location-context";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const { location, openPicker } = useLocation();

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-primary)]/80 border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-purple-500/20">
            <Pill size={17} className="text-white" />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
          </div>
          <div className="font-display font-bold text-lg tracking-tight">
            Med<span className="gradient-text">Price</span>
          </div>
        </Link>

        <nav className="flex items-center gap-0 md:gap-1 text-sm">
          <button
            onClick={openPicker}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-text-secondary hover:text-silver-100 hover:bg-overlay-5 transition-colors"
            title="Change location"
          >
            <MapPin size={13} className="text-purple-300" />
            <span className="text-xs">
              {location ? (
                <>
                  {location.city ?? "—"}
                  {location.pincode && ` · ${location.pincode}`}
                </>
              ) : (
                "Set location"
              )}
            </span>
            <ChevronDown size={11} className="text-text-muted" />
          </button>
          <Link
            href="/jan-aushadhi"
            className="nav-link px-3 py-2 rounded-lg text-text-secondary hover:text-silver-100 transition-colors"
          >
            Jan Aushadhi
          </Link>
          <Link
            href="/upload"
            className="nav-link px-3 py-2 rounded-lg text-text-secondary hover:text-silver-100 transition-colors"
          >
            <span className="hidden sm:inline">Upload Prescription</span>
            <span className="inline sm:hidden">Upload</span>
          </Link>
          <Link
            href="/admin"
            className="nav-link px-3 py-2 rounded-lg text-text-muted hover:text-silver-100 transition-colors hidden sm:inline"
          >
            Admin
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
