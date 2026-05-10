"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

interface Point {
  recordedAt: string;
  sellingPrice: number | null;
  mrp: number | null;
}

interface SeriesResponse {
  series: Record<string, Point[]>;
}

const PHARMACY_COLORS: Record<string, string> = {
  "1mg": "#ef4444",
  netmeds: "#3b82f6",
  pharmeasy: "#06b6d4",
  apollo: "#f97316",
  truemeds: "#8b5cf6",
  mrmed: "#a855f7",
};

const W = 720;
const H = 240;
const PAD = { top: 20, right: 20, bottom: 30, left: 50 };

export function PriceHistoryChart({ medicineId }: { medicineId: string }) {
  const [data, setData] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ x: number; date: Date } | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/price-history/${medicineId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [medicineId]);

  const { series, xMin, xMax, yMin, yMax, hasData, pharmacyStats } = useMemo(() => {
    const series = data?.series ?? {};
    const allPoints = Object.values(series).flat();
    if (allPoints.length === 0) {
      return {
        series: {},
        xMin: 0,
        xMax: 1,
        yMin: 0,
        yMax: 1,
        hasData: false,
        pharmacyStats: {},
      };
    }

    const dates = allPoints.map((p) => new Date(p.recordedAt).getTime());
    const prices = allPoints
      .map((p) => p.sellingPrice ?? p.mrp)
      .filter((v): v is number => v != null);

    const xMin = Math.min(...dates);
    const xMax = Math.max(...dates);
    const yMin = Math.min(...prices) * 0.9;
    const yMax = Math.max(...prices) * 1.1;

    // Per-pharmacy trend stats
    const stats: Record<string, { latest: number; first: number; trend: "up" | "down" | "flat" }> = {};
    for (const [name, points] of Object.entries(series)) {
      const valued = points.filter((p) => (p.sellingPrice ?? p.mrp) != null);
      if (valued.length < 1) continue;
      const first = valued[0].sellingPrice ?? valued[0].mrp!;
      const latest = valued[valued.length - 1].sellingPrice ?? valued[valued.length - 1].mrp!;
      const diff = latest - first;
      stats[name] = {
        first,
        latest,
        trend: Math.abs(diff) < 0.01 ? "flat" : diff > 0 ? "up" : "down",
      };
    }

    return {
      series,
      xMin,
      xMax: xMax === xMin ? xMax + 1 : xMax,
      yMin,
      yMax: yMax === yMin ? yMax + 1 : yMax,
      hasData: true,
      pharmacyStats: stats,
    };
  }, [data]);

  const xScale = (t: number) =>
    PAD.left + ((t - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const yScale = (v: number) =>
    PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="skeleton h-5 w-40 mb-4" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="glass-card p-6">
        <h3 className="font-display font-semibold text-lg mb-2">Price History</h3>
        <p className="text-text-secondary text-sm">
          Not enough data yet. Search this medicine again tomorrow to start tracking price changes.
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-display font-semibold text-lg">Price History</h3>
          <p className="text-xs text-text-secondary">
            Last 90 days, cheapest per pharmacy per scrape
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={W}
          height={H}
          className="block"
          onMouseMove={(e) => {
            const rect = (e.target as SVGSVGElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < PAD.left || x > W - PAD.right) {
              setHover(null);
              return;
            }
            const t = xMin + ((x - PAD.left) / (W - PAD.left - PAD.right)) * (xMax - xMin);
            setHover({ x, date: new Date(t) });
          }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grid */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={yScale(t) + 4}
                fontSize={10}
                textAnchor="end"
                fill="rgba(255,255,255,0.4)"
                fontFamily="DM Sans"
              >
                ₹{Math.round(t)}
              </text>
            </g>
          ))}

          {/* Lines per pharmacy */}
          {Object.entries(series).map(([name, points]) => {
            const valid = points.filter((p) => (p.sellingPrice ?? p.mrp) != null);
            if (valid.length === 0) return null;
            const color = PHARMACY_COLORS[name] ?? "#94a3b8";
            const path = valid
              .map((p, i) => {
                const x = xScale(new Date(p.recordedAt).getTime());
                const y = yScale(p.sellingPrice ?? p.mrp!);
                return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");
            return (
              <g key={name}>
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {valid.map((p, i) => (
                  <circle
                    key={i}
                    cx={xScale(new Date(p.recordedAt).getTime())}
                    cy={yScale(p.sellingPrice ?? p.mrp!)}
                    r={2.5}
                    fill={color}
                  />
                ))}
              </g>
            );
          })}

          {/* Hover line */}
          {hover && (
            <g>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={hover.x}
                y={H - 10}
                fontSize={10}
                textAnchor="middle"
                fill="rgba(255,255,255,0.6)"
                fontFamily="DM Sans"
              >
                {hover.date.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(pharmacyStats).map(([name, stat]) => {
          const color = PHARMACY_COLORS[name] ?? "#94a3b8";
          const TrendIcon =
            stat.trend === "up" ? TrendingUp : stat.trend === "down" ? TrendingDown : Minus;
          const trendColor =
            stat.trend === "up"
              ? "text-red-400"
              : stat.trend === "down"
              ? "text-emerald-400"
              : "text-text-secondary";
          return (
            <div
              key={name}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-overlay-5 border border-overlay-5"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              <span className="font-medium capitalize">{name}</span>
              <span className="text-text-secondary">
                {formatCurrency(stat.latest)}
              </span>
              <TrendIcon size={11} className={trendColor} />
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
