"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const PHARMACY_LABELS: Record<string, string> = {
  "1mg": "1mg",
  pharmeasy: "PharmEasy",
  netmeds: "Netmeds",
  truemeds: "Truemeds",
  mrmed: "MrMed",
  apollo: "Apollo",
};

/**
 * Placeholder card shown for each pharmacy that hasn't yet responded.
 * Replaced by a real <PriceCard /> the moment that pharmacy's listing
 * chunk arrives over the NDJSON stream.
 */
export function PriceCardSkeleton({
  pharmacyName,
  index = 0,
}: {
  pharmacyName: string;
  index?: number;
}) {
  const label = PHARMACY_LABELS[pharmacyName] ?? pharmacyName;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="glass-card relative p-5 overflow-hidden"
    >
      {/* Shimmer */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(167,139,250,0.08), transparent)",
        }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="flex flex-col md:flex-row md:items-center gap-4 relative">
        <div className="flex items-center gap-2 md:w-44">
          <span className="pharmacy-badge border border-overlay-10 text-text-secondary">
            {label}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="h-4 w-2/3 rounded bg-overlay-10/60 mb-2 animate-pulse" />
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <div className="h-3 w-20 rounded bg-overlay-5 animate-pulse" />
            <div className="h-3 w-24 rounded bg-overlay-5 animate-pulse" />
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 md:w-72">
          <div className="text-right">
            <div className="h-7 w-24 rounded bg-overlay-10/60 mb-1 animate-pulse ml-auto" />
            <div className="h-3 w-16 rounded bg-overlay-5 animate-pulse ml-auto" />
          </div>
          <div className="shrink-0 inline-flex items-center gap-1.5 text-xs text-text-muted px-3 py-2 rounded-full border border-overlay-10">
            <Loader2 size={11} className="animate-spin" /> Fetching
          </div>
        </div>
      </div>
    </motion.div>
  );
}
