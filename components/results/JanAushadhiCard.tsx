"use client";

import { motion } from "framer-motion";
import { Heart, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { AvailabilityWarning } from "./AvailabilityWarning";

interface JanAushadhiCardProps {
  product: {
    id: string;
    drugCode: string;
    genericName: string;
    unitSize?: string | null;
    mrpBppi?: number | null;
  };
  cheapestOnlinePrice?: number | null;
  onFindStore?: () => void;
}

export function JanAushadhiCard({
  product,
  cheapestOnlinePrice,
  onFindStore,
}: JanAushadhiCardProps) {
  const savings =
    cheapestOnlinePrice && product.mrpBppi
      ? Math.max(0, cheapestOnlinePrice - product.mrpBppi)
      : null;
  const savingsPct =
    cheapestOnlinePrice && savings
      ? Math.round((savings / cheapestOnlinePrice) * 100)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="ja-row p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-center gap-3 md:w-56">
          <div className="w-10 h-10 rounded-full bg-accent-green/20 flex items-center justify-center">
            <Heart size={18} className="text-accent-green" fill="currentColor" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-accent-green font-bold">
              Government Generic
            </div>
            <div className="font-display font-semibold">Jan Aushadhi</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{product.genericName}</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {product.unitSize ?? "—"} · Code {product.drugCode}
          </p>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 md:w-72">
          <div className="text-right">
            <div className="font-display font-bold text-2xl gradient-text-green">
              {formatCurrency(product.mrpBppi)}
            </div>
            {savingsPct && savingsPct > 0 && (
              <div className="text-[11px] text-accent-green font-medium savings-badge inline-block px-2 py-0.5 rounded-full bg-accent-green/10 mt-1">
                Save {savingsPct}%
              </div>
            )}
          </div>
          <button
            onClick={onFindStore}
            className="px-4 py-2 rounded-xl bg-accent-green text-ink-950 font-semibold text-sm hover:bg-emerald-400 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <MapPin size={14} /> Find Store
          </button>
        </div>
      </div>
      <AvailabilityWarning className="mt-4" />
    </motion.div>
  );
}
