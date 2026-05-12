"use client";

import { motion } from "framer-motion";
import { SearchBar } from "@/components/search/SearchBar";

export function Hero() {
  return (
    <section className="relative min-h-[88vh] flex items-center justify-center px-4">
      {/* Blobs are clipped to the hero, but the section itself is not, so the
          autocomplete dropdown can extend below it. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="hero-blob bg-purple-400/40 w-[420px] h-[420px] -top-32 -left-24"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="hero-blob bg-emerald-500/30 w-[460px] h-[460px] bottom-0 -right-32"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="relative z-10 max-w-3xl w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-overlay-10 bg-overlay-5 text-xs text-text-secondary mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          India's most comprehensive medicine price comparison
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="font-display font-bold text-5xl md:text-6xl tracking-tight leading-[1.05] mb-5"
        >
          Pay Less for{" "}
          <span className="gradient-text">Every Medicine.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-text-secondary text-base md:text-lg max-w-xl mx-auto mb-10"
        >
          Compare prices across 1mg, Apollo, Netmeds, PharmEasy, Truemeds, MrMed —
          and India's <span className="text-accent-green font-medium">10,000+ Jan Aushadhi</span> stores.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 220,
            damping: 22,
            delay: 0.4,
          }}
        >
          <SearchBar />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-8 flex flex-wrap justify-center gap-2 text-xs"
        >
          {[
            "6 pharmacies + Jan Aushadhi",
            "10,000+ Jan Aushadhi stores",
            "No signup needed",
          ].map((s, i) => (
            <motion.span
              key={s}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.1 }}
              className="px-3 py-1.5 rounded-full bg-overlay-5 border border-overlay-10 text-text-secondary"
            >
              {s}
            </motion.span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
