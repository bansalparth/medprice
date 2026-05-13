"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin, ChevronDown } from "lucide-react";
import { useLocation } from "@/lib/location-context";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const { location, openPicker } = useLocation();

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--bg-primary)]/80 border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="rounded-lg bg-[#1a1a1a] flex items-center justify-center px-2 h-9 overflow-hidden group-hover:scale-105 transition-transform shadow-lg shadow-black/30">
            <Image
              src="/logo.png"
              alt="MedPrice"
              width={750}
              height={280}
              priority
              className="h-6 w-auto"
            />
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
                  {/* Fall through: city → pincode → state → coords. Never
                      render bare "—" — that's what users were reporting as
                      a "blank" location even though we'd captured one. */}
                  {location.city ??
                    location.pincode ??
                    location.state ??
                    `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`}
                  {location.city && location.pincode && ` · ${location.pincode}`}
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
