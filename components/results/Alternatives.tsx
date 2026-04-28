"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Beaker, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Alt {
  id: string;
  name: string;
  brandName: string | null;
  manufacturer: string | null;
  saltComposition: string | null;
  ingredients: string[];
  dosageForm: string | null;
  packSize: string | null;
  similarity: number;
  sharedIngredients: string[];
  cheapestPharmacy: string | null;
  cheapestPrice: number | null;
}

interface Resp {
  mode: "ingredients" | "salt-fallback" | "none";
  ingredients: string[];
  saltComposition: string | null;
  alternatives: Alt[];
  disclaimer: string;
}

export function Alternatives({
  medicineId,
  saltComposition,
}: {
  medicineId: string;
  saltComposition?: string | null;
}) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/alternatives/${medicineId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [medicineId]);

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="skeleton h-5 w-48 mb-4" />
        <div className="space-y-2">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      </div>
    );
  }

  if (!data || data.mode === "none") {
    return (
      <div className="glass-card p-6">
        <h3 className="font-display font-semibold text-lg mb-2 flex items-center gap-2">
          <Beaker size={18} className="text-purple-300" /> Alternatives by ingredient
        </h3>
        <p className="text-text-secondary text-sm">
          {saltComposition
            ? "We don't have this medicine's active ingredients in our verified catalog yet, so we can't suggest alternatives."
            : "Salt composition not detected for this medicine."}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          <Beaker size={18} className="text-purple-300" />
          Alternatives by ingredient
        </h3>
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
      </div>

      {data.alternatives.length === 0 ? (
        <p className="text-text-secondary text-sm">
          No verified alternatives in our catalog with the same active ingredients yet.
        </p>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {data.alternatives.map((a, i) => {
              const matchPct = Math.round(a.similarity * 100);
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
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            matchPct === 100
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-purple-500/15 text-purple-300"
                          }`}
                        >
                          {matchPct === 100 ? "Identical" : `${matchPct}% match`}
                        </span>
                      </div>
                      <div className="text-xs text-text-secondary truncate">
                        {a.saltComposition}
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
                        <div className="text-xs text-text-muted">No live price</div>
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
