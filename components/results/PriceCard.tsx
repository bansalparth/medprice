"use client";

import { motion } from "framer-motion";
import { Crown, ExternalLink, Package, Truck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLocation } from "@/lib/location-context";

const PHARMACY_LABELS: Record<
  string,
  { label: string; color: string; pincodeAware: boolean }
> = {
  "1mg": {
    label: "1mg",
    color: "bg-red-500/10 text-red-300 border-red-500/20",
    pincodeAware: false,
  },
  netmeds: {
    label: "Netmeds",
    color: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    pincodeAware: false,
  },
  pharmeasy: {
    label: "PharmEasy",
    color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
    pincodeAware: false,
  },
  apollo: {
    label: "Apollo",
    color: "bg-orange-500/10 text-orange-300 border-orange-500/20",
    pincodeAware: true,
  },
  truemeds: {
    label: "Truemeds",
    color: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    pincodeAware: false,
  },
  mrmed: {
    label: "MrMed",
    color: "bg-purple-500/10 text-purple-300 border-purple-500/20",
    pincodeAware: false,
  },
};

interface PriceCardProps {
  listing: {
    id: string;
    pharmacyName: string;
    productName: string;
    packSize?: string | null;
    mrp?: number | null;
    sellingPrice?: number | null;
    discountPercent?: number | null;
    inStock: boolean;
    productUrl?: string | null;
    deliveryEta?: string | null;
  };
  medicineId: string;
  isCheapest?: boolean;
  index?: number;
}

export function PriceCard({
  listing,
  medicineId,
  isCheapest = false,
  index = 0,
}: PriceCardProps) {
  const { location } = useLocation();
  const meta = PHARMACY_LABELS[listing.pharmacyName] ?? {
    label: listing.pharmacyName,
    color: "bg-white/5 text-text-secondary border-white/10",
    pincodeAware: false,
  };
  const buyHref = `/api/go/${listing.pharmacyName}/${medicineId}${
    location?.pincode ? `?pincode=${location.pincode}` : ""
  }`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className={`glass-card relative p-5 group ${
        listing.inStock ? "" : "oos-dim"
      }`}
    >
      {isCheapest && (
        <div className="absolute -top-2 -right-2 px-2.5 py-1 rounded-full bg-gradient-to-r from-purple-400 to-purple-300 text-ink-950 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg">
          <Crown size={11} /> Best Price
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-2 md:w-44">
          <span className={`pharmacy-badge border ${meta.color}`}>
            {meta.label}
          </span>
          {!meta.pincodeAware && (
            <span
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-text-muted border border-white/5"
              title="This pharmacy doesn't expose pincode-specific pricing on its search page — list price is national."
            >
              National
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{listing.productName}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-text-secondary">
            {listing.packSize && (
              <span className="flex items-center gap-1">
                <Package size={11} /> {listing.packSize}
              </span>
            )}
            {listing.inStock && listing.deliveryEta && (
              <span className="flex items-center gap-1 text-emerald-300/90">
                <Truck size={11} /> {listing.deliveryEta}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 md:w-72">
          <div className="text-right">
            {listing.mrp && listing.sellingPrice && listing.mrp > listing.sellingPrice && (
              <div className="text-xs text-text-muted line-through">
                {formatCurrency(listing.mrp)}
              </div>
            )}
            <div className="font-display font-bold text-lg">
              {formatCurrency(listing.sellingPrice ?? listing.mrp)}
            </div>
            {listing.discountPercent && listing.discountPercent > 0 && (
              <div className="text-[11px] text-accent-green font-medium">
                {listing.discountPercent}% off
              </div>
            )}
          </div>
          {listing.inStock ? (
            <a
              href={buyHref}
              target="_blank"
              rel="noreferrer noopener"
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-purple-400 hover:text-ink-950 border border-white/10 hover:border-purple-400 text-sm font-semibold transition-all flex items-center gap-1.5"
            >
              Buy <ExternalLink size={13} />
            </a>
          ) : (
            <span className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 text-sm border border-red-500/20">
              Out of stock
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
