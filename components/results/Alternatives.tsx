"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Beaker, ShieldAlert, FlaskConical, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Alt {
  id: string;
  name: string;
  brandName: string | null;
  manufacturer: string | null;
  saltComposition: string | null;
  dosageForm: string | null;
  packSize: string | null;
  similarity: number;
  matchType: "ingredient" | "salt" | "substitute";
  cheapestPharmacy: string | null;
  cheapestPrice: number | null;
}

interface Resp {
  mode: "ingredients" | "salt-match" | "substitutes" | "none";
  ingredients: string[];
  saltComposition: string | null;
  pharmacy: string | null;
  alternatives: Alt[];
  disclaimer: string;
}

function matchLabel(alt: Alt): { text: string; className: string } {
  if (alt.matchType === "ingredient") {
    const pct = Math.round(alt.similarity * 100);
    return pct === 100
      ? { text: "Identical", className: "bg-emerald-500/15 text-emerald-300" }
      : { text: `${pct}% match`, className: "bg-purple-500/15 text-purple-300" };
  }
  if (alt.matchType === "salt") {
    return { text: "Same composition", className: "bg-blue-500/15 text-blue-300" };
  }
  return { text: "Suggested", className: "bg-amber-500/15 text-amber-300" };
}

function modeIcon(mode: string) {
  if (mode === "salt-match") return <FlaskConical size={18} className="text-blue-300" />;
  if (mode === "substitutes") return <FileText size={18} className="text-amber-300" />;
  return <Beaker size={18} className="text-purple-300" />;
}

function modeTitle(mode: string) {
  if (mode === "salt-match") return "Alternatives (same composition)";
  if (mode === "substitutes") return "Suggested alternatives";
  return "Alternatives by ingredient";
}

export function Alternatives({
  medicineId,
  saltComposition,
  cheapestPharmacy,
}: {
  medicineId: string;
  saltComposition?: string | null;
  cheapestPharmacy?: string | null;
}) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cheapestPharmacy) params.set("pharmacy", cheapestPharmacy);
    fetch(`/api/alternatives/${medicineId}?${params}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [medicineId, cheapestPharmacy]);

  if (loading) {
    return (
      <div className="glass-card p-6 mt-5">
        <div className="skeleton h-5 w-48 mb-4" />
        <div className="space-y-2">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
        <p className="text-xs text-text-muted mt-3">Fetching alternative prices...</p>
      </div>
    );
  }

  if (!data || data.mode === "none") {
    return (
      <div className="glass-card p-6 mt-5">
        <h3 className="font-display font-semibold text-lg mb-2 flex items-center gap-2">
          <Beaker size={18} className="text-purple-300" /> Alternatives
        </h3>
        <p className="text-text-secondary text-sm">
          {saltComposition
            ? "No verified alternatives found for this medicine yet."
            : "Salt composition not detected — can't suggest alternatives."}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 mt-5"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          {modeIcon(data.mode)}
          {modeTitle(data.mode)}
        </h3>
        {data.ingredients.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.ingredients.map((t) => (
              <span
                key={t}
                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-mono"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {data.alternatives.length === 0 ? (
        <p className="text-text-secondary text-sm">
          No verified alternatives in our catalog yet.
        </p>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {data.alternatives.map((a, i) => {
              const label = matchLabel(a);
              return (
                <Link
                  key={a.id}
                  href={`/search?medicineId=${a.id}`}
                  className="block"
                >
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-purple-500/10 border border-white/5 hover:border-purple-400/40 transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        <span>{a.brandName ?? a.name}</span>
                        {a.dosageForm && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-text-secondary">
                            {a.dosageForm}
                          </span>
                        )}
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${label.className}`}
                        >
                          {label.text}
                        </span>
                      </div>
                      <div className="text-xs text-text-secondary truncate">
                        {a.saltComposition ?? a.name}
                        {a.manufacturer && ` · ${a.manufacturer}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {a.cheapestPrice != null ? (
                        <>
                          <div className="font-display font-bold text-base">
                            {formatCurrency(a.cheapestPrice)}
                          </div>
                          <div className="text-[10px] text-text-muted capitalize">
                            on {a.cheapestPharmacy}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-text-muted">No price yet</div>
                      )}
                    </div>
                    <ArrowRight
                      size={16}
                      className="text-text-muted group-hover:text-purple-300 transition-colors shrink-0"
                    />
                  </motion.div>
                </Link>
              );
            })}
          </div>

          <div className="flex gap-2 items-start text-[11px] text-text-muted leading-relaxed border-t border-white/5 pt-3">
            <ShieldAlert size={13} className="text-purple-300 mt-0.5 shrink-0" />
            <p>{data.disclaimer}</p>
          </div>
        </>
      )}
    </motion.div>
  );
}
