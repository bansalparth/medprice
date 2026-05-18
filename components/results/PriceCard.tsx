"use client";

import { motion } from "framer-motion";
import { Crown, ExternalLink, Loader2, Package, Truck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useLocation } from "@/lib/location-context";
import { extractPackCount } from "@/lib/pack-size";

const PHARMACY_LABELS: Record<string, { label: string; color: string }> = {
  "1mg": {
    label: "1mg",
    color: "bg-red-500/10 text-red-300 border-red-500/20",
  },
  netmeds: {
    label: "Netmeds",
    color: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  },
  pharmeasy: {
    label: "PharmEasy",
    color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  },
  apollo: {
    label: "Apollo",
    color: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  },
  truemeds: {
    label: "Truemeds",
    color: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  },
  mrmed: {
    label: "MrMed",
    color: "bg-purple-500/10 text-purple-300 border-purple-500/20",
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
    /** True while the live serviceability/ETA call is still in flight.
     *  Drives the "checking delivery…" inline placeholder. */
    etaPending?: boolean;
    serviceable?: boolean | null;
    locationPrice?: number | null;
    /**
     * Unconditional price (Pharmeasy: assured discount). When present, this is
     * what we show as the primary price — the coupon-conditional `sellingPrice`
     * is surfaced as a secondary "with COUPON" line instead.
     */
    baseSellingPrice?: number | null;
    baseDiscountPercent?: number | null;
    couponCode?: string | null;
    couponMinCart?: number | null;
    couponAppOnly?: boolean | null;
    couponFinalPrice?: number | null;
  };
  medicineId: string;
  isCheapest?: boolean;
  index?: number;
  searchLogId?: string | null;
  position?: number;
}

export function PriceCard({
  listing,
  medicineId,
  isCheapest = false,
  index = 0,
  searchLogId = null,
  position,
}: PriceCardProps) {
  const { location } = useLocation();
  const meta = PHARMACY_LABELS[listing.pharmacyName] ?? {
    label: listing.pharmacyName,
    color: "bg-overlay-5 text-text-secondary border-overlay-10",
  };
  const packCount = extractPackCount(listing.productName, listing.packSize);
  const buyParams = new URLSearchParams();
  if (location?.pincode) buyParams.set("pincode", location.pincode);
  if (searchLogId) buyParams.set("sl", searchLogId);
  if (typeof position === "number") buyParams.set("pos", String(position));
  // Log the UNCONDITIONAL price (what the user actually saw on the card),
  // not the coupon-applied `sellingPrice` — otherwise click analytics undercount
  // Pharmeasy's real price by the coupon delta.
  const loggedPrice =
    listing.baseSellingPrice ?? listing.sellingPrice ?? null;
  if (loggedPrice != null) buyParams.set("p", String(loggedPrice));
  if (listing.mrp != null) buyParams.set("m", String(listing.mrp));
  if (isCheapest) buyParams.set("c", "1");
  const buyHref = `/api/go/${listing.pharmacyName}/${medicineId}${
    buyParams.toString() ? `?${buyParams.toString()}` : ""
  }`;

  // We now display the REAL ETA string straight from the pharmacy's own
  // delivery endpoint (e.g. PharmEasy's "Delivery by Thu 14 May, before
  // 11:00 pm" or 1mg's "Get in 30 minutes"). No more static heuristics.
  const deliveryLabel = listing.deliveryEta ?? null;

  // Primary price: unconditional. Pharmeasy's `sellingPrice` already includes
  // its best conditional coupon (e.g. MED27PE: 27% off above ₹1000 cart). The
  // `baseSellingPrice` is the "assured" price without that coupon — what the
  // user actually pays in a single-product checkout. We show base as primary
  // and surface the conditional offer as a secondary line below.
  const unconditional =
    listing.baseSellingPrice ?? listing.sellingPrice ?? listing.mrp;
  const displayPrice = listing.locationPrice ?? unconditional;
  const displayDiscount =
    listing.baseDiscountPercent ?? listing.discountPercent ?? null;
  const displayMrp = listing.mrp;
  const isLocationPrice = listing.locationPrice != null && listing.locationPrice !== listing.sellingPrice;
  const notServiceable = listing.serviceable === false;
  const hasCoupon =
    listing.couponCode != null && listing.couponFinalPrice != null;

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
          <Crown size={11} /> Best Online Price
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-2 md:w-44">
          <span className={`pharmacy-badge border ${meta.color}`}>
            {meta.label}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{listing.productName}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-text-secondary">
            {packCount != null ? (
              <span className="flex items-center gap-1">
                <Package size={11} /> {packCount} tablets
              </span>
            ) : listing.packSize ? (
              <span className="flex items-center gap-1">
                <Package size={11} /> {listing.packSize}
              </span>
            ) : null}
            {notServiceable ? (
              <span className="flex items-center gap-1 text-red-400/90">
                <Truck size={11} /> Not available at your pincode
              </span>
            ) : listing.inStock && deliveryLabel ? (
              <span
                className="flex items-center gap-1 text-emerald-300/90"
                title="Live delivery estimate from the pharmacy"
              >
                <Truck size={11} /> {deliveryLabel}
              </span>
            ) : listing.inStock && listing.etaPending ? (
              <span className="flex items-center gap-1 text-text-muted">
                <Loader2 size={10} className="animate-spin" />
                checking delivery…
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 md:w-72">
          <div className="text-right">
            {displayMrp && displayPrice && displayMrp > displayPrice && (
              <div className="text-xs text-text-muted line-through">
                {formatCurrency(displayMrp)}
              </div>
            )}
            <div className="font-display font-bold text-lg">
              {formatCurrency(displayPrice)}
            </div>
            {isLocationPrice && location?.pincode && (
              <div className="text-[10px] text-purple-300/80 font-medium">
                at {location.pincode}
              </div>
            )}
            {(displayDiscount ?? 0) > 0 && (
              <div className="text-[11px] text-accent-green font-medium">
                {Math.round(displayDiscount as number)}% off
              </div>
            )}
            {hasCoupon && (
              <div
                className="mt-1.5 text-[10px] text-text-muted leading-tight"
                title="This discount only applies when the order meets the coupon's conditions."
              >
                <div>
                  with {listing.couponCode}:{" "}
                  <span className="text-text-secondary font-medium">
                    {formatCurrency(listing.couponFinalPrice)}
                  </span>
                </div>
                {listing.couponMinCart != null && (
                  <div className="text-text-muted/80">
                    Cart ≥ {formatCurrency(listing.couponMinCart)}
                  </div>
                )}
              </div>
            )}
          </div>
          {listing.inStock ? (
            <a
              href={buyHref}
              target="_blank"
              rel="noreferrer noopener"
              className="px-4 py-2 rounded-xl bg-overlay-5 hover:bg-purple-400 hover:text-ink-950 border border-overlay-10 hover:border-purple-400 text-sm font-semibold transition-all flex items-center gap-1.5"
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
