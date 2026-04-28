"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  CheckCircle2,
  Circle,
  Search,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

/**
 * Interactive search progress display. Simulates per-pharmacy progress with
 * staggered reveal — gives the user a tangible sense of "things are happening"
 * while the actual scrape runs server-side. The simulation paces itself so it
 * arrives at "almost done" when most real scrapes complete (~6-10s), and
 * loops gracefully if the real result takes longer.
 */

const PHARMACIES = [
  { name: "1mg", color: "#ef4444" },
  { name: "Apollo Pharmacy", color: "#f97316" },
  { name: "PharmEasy", color: "#06b6d4" },
  { name: "Netmeds", color: "#3b82f6" },
  { name: "Truemeds", color: "#a78bfa" },
  { name: "MrMed", color: "#c084fc" },
];

const STAGES = [
  { icon: Search, label: "Locating brand variants", duration: 1200 },
  { icon: Sparkles, label: "Querying pharmacies in parallel", duration: 6500 },
  { icon: ShieldCheck, label: "Verifying salt composition", duration: 1500 },
  { icon: CheckCircle2, label: "Ranking by price", duration: 800 },
];

interface Props {
  query: string;
  pincode?: string | null;
  city?: string | null;
}

export function SearchProgress({ query, pincode, city }: Props) {
  const [stageIdx, setStageIdx] = useState(0);
  const [completedPharmacies, setCompletedPharmacies] = useState<Set<string>>(
    new Set()
  );
  const [activePharmacy, setActivePharmacy] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Stage timeline
  useEffect(() => {
    let mounted = true;
    let acc = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    STAGES.forEach((stage, i) => {
      const t = setTimeout(() => {
        if (mounted) setStageIdx(i);
      }, acc);
      timers.push(t);
      acc += stage.duration;
    });
    return () => {
      mounted = false;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [query]);

  // Pharmacy completion simulation — randomized order with realistic timing
  useEffect(() => {
    let mounted = true;
    const order = [...PHARMACIES].sort(() => Math.random() - 0.5);
    const timers: ReturnType<typeof setTimeout>[] = [];

    order.forEach((p, i) => {
      // Active state ~300ms before completion
      const startDelay = 1200 + i * 700 + Math.random() * 400;
      const completeDelay = startDelay + 700 + Math.random() * 500;

      timers.push(
        setTimeout(() => {
          if (mounted) setActivePharmacy(p.name);
        }, startDelay)
      );

      timers.push(
        setTimeout(() => {
          if (!mounted) return;
          setCompletedPharmacies((prev) => {
            const next = new Set(prev);
            next.add(p.name);
            return next;
          });
          setActivePharmacy((cur) => (cur === p.name ? null : cur));
        }, completeDelay)
      );
    });

    return () => {
      mounted = false;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [query]);

  // Tick counter for elapsed time
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const StageIcon = STAGES[stageIdx].icon;

  return (
    <div className="space-y-6">
      {/* Top status banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5"
      >
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 shrink-0">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, rgba(167,139,250,0.6), transparent 40%, rgba(196,181,253,0.4) 80%, rgba(167,139,250,0.6))",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
            <div className="absolute inset-1 rounded-full bg-ink-950 flex items-center justify-center">
              <StageIcon size={18} className="text-purple-300" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-text-secondary">
              Searching for
            </div>
            <div className="font-display font-semibold text-lg truncate">
              {query}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-text-secondary">Elapsed</div>
            <div className="font-mono text-purple-300 tabular-nums">
              {elapsed}s
            </div>
          </div>
        </div>

        {/* Stage tracker */}
        <div className="mt-5 space-y-2">
          {STAGES.map((s, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            const Icon = s.icon;
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  active
                    ? "bg-purple-500/10 border border-purple-500/30"
                    : "border border-transparent"
                }`}
              >
                {done ? (
                  <CheckCircle2
                    size={16}
                    className="text-emerald-400 shrink-0"
                  />
                ) : active ? (
                  <Loader2
                    size={16}
                    className="text-purple-300 animate-spin shrink-0"
                  />
                ) : (
                  <Circle size={16} className="text-text-muted shrink-0" />
                )}
                <span
                  className={`text-sm flex-1 ${
                    active
                      ? "text-silver-100 font-medium"
                      : done
                      ? "text-text-secondary"
                      : "text-text-muted"
                  }`}
                >
                  {s.label}
                </span>
                {active && (
                  <Icon size={13} className="text-purple-300 shrink-0" />
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Per-pharmacy live status */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-text-secondary">
              Pharmacies queried
            </div>
            <div className="font-display font-semibold">
              {completedPharmacies.size} of {PHARMACIES.length} responded
            </div>
          </div>
          {city && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                Delivery to
              </div>
              <div className="text-xs text-text-secondary">
                {city}
                {pincode && ` · ${pincode}`}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {PHARMACIES.map((p, i) => {
            const done = completedPharmacies.has(p.name);
            const active = activePharmacy === p.name;
            return (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all overflow-hidden ${
                  done
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : active
                    ? "bg-purple-500/10 border-purple-400/40"
                    : "bg-white/[0.02] border-white/5"
                }`}
              >
                {active && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${p.color}22, transparent)`,
                    }}
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                )}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.color }}
                />
                <span
                  className={`text-sm flex-1 truncate ${
                    done ? "" : active ? "text-silver-100" : "text-text-secondary"
                  }`}
                >
                  {p.name}
                </span>
                <AnimatePresence mode="wait">
                  {done ? (
                    <motion.span
                      key="done"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    </motion.span>
                  ) : active ? (
                    <motion.span
                      key="active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <Loader2
                        size={14}
                        className="text-purple-300 animate-spin"
                      />
                    </motion.span>
                  ) : (
                    <span className="text-text-muted text-[10px] uppercase tracking-wider">
                      queued
                    </span>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-4 text-[11px] text-text-muted text-center leading-relaxed">
          New medicines take ~5–10s. Subsequent searches are instant from cache.
        </div>
      </motion.div>
    </div>
  );
}
