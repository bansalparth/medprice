"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#a78bfa", "#34d399", "#60a5fa", "#fbbf24", "#f472b6", "#22d3ee", "#fb7185", "#86efac"];

type Window = "1h" | "24h" | "7d" | "30d" | "all";

interface PanelProps {
  user: string;
  password: string;
  window: Window;
}

async function fetchPanel(name: string, window: Window, user: string, password: string) {
  const res = await fetch(`/api/admin/metrics?panel=${name}&window=${window}`, {
    headers: { "x-admin-user": user, "x-admin-password": password },
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

function usePanel<T>(name: string, props: PanelProps): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPanel(name, props.window, props.user, props.password)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, props.window, props.user, props.password]);

  return { data, loading, error };
}

function Card({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">{title}</div>
        {hint && <div className="text-[10px] text-text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function BigStat({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <Card title={label}>
      <div className="font-display font-bold text-3xl">{value}</div>
      {sub && <div className="text-xs text-text-secondary mt-1">{sub}</div>}
    </Card>
  );
}

function LoadingBlock() {
  return <div className="glass-card p-6 text-sm text-text-muted">Loading…</div>;
}

function ErrorBlock({ error }: { error: string }) {
  return <div className="glass-card p-6 text-sm text-red-300">Error: {error}</div>;
}

function formatPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n}%`;
}

function formatMs(n: number | null | undefined) {
  if (n == null) return "—";
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function bucketsToRows(b: Record<string, number>): { key: string; count: number }[] {
  return Object.entries(b).map(([key, count]) => ({ key, count }));
}

function ChartFrame({ children, height = 220 }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  );
}

const TICK = { fill: "#a8aac0", fontSize: 11 };
const GRID = { stroke: "rgba(255,255,255,0.05)" };

/* ───────────── TRAFFIC ───────────── */

export function TrafficPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("traffic", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  const tsLabel = (t: number) => {
    const d = new Date(t);
    if (props.window === "7d" || props.window === "30d") {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  const series = data.timeseries.map((p: any) => ({ ...p, label: tsLabel(p.t) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat label="Sessions" value={data.sessions} sub={`${data.newSessions} new · ${data.returning} returning`} />
        <BigStat label="Pageviews" value={data.pageviews} />
        <BigStat label="Bounce rate" value={formatPct(data.bounceRate)} sub="single-pageview sessions" />
        <BigStat label="Pages/session (top)" value={Object.entries(data.pageviewsPerSession).reduce((max: [string, any], cur: any) => (cur[1] > (max?.[1] ?? 0) ? cur : max), ["", 0])[0]} />
      </div>

      <Card title="Traffic over time">
        <ChartFrame height={220}>
          <LineChart data={series}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" tick={TICK} />
            <YAxis tick={TICK} />
            <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="pageviews" stroke="#a78bfa" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sessions" stroke="#34d399" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Device split">
          <ChartFrame height={180}>
            <PieChart>
              <Pie data={data.deviceBreakdown} dataKey="count" nameKey="device" outerRadius={70} label={{ fontSize: 10, fill: "#e7e9f1" }}>
                {data.deviceBreakdown.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            </PieChart>
          </ChartFrame>
        </Card>
        <Card title="Referrer">
          <ChartFrame height={180}>
            <BarChart data={data.referrerBreakdown}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="referrer" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#60a5fa" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
        <Card title="Pages/session histogram">
          <ChartFrame height={180}>
            <BarChart data={bucketsToRows(data.pageviewsPerSession)}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="key" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#fbbf24" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
      </div>

      <Card title="Top paths">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider">
              <th className="text-left py-2">Path</th>
              <th className="text-right py-2">Pageviews</th>
            </tr>
          </thead>
          <tbody>
            {data.topPaths.map((r: any) => (
              <tr key={r.path} className="border-t border-overlay-5">
                <td className="py-1.5 font-mono text-xs">{r.path}</td>
                <td className="py-1.5 text-right">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ───────────── GEOGRAPHY ───────────── */

export function GeographyPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("geography", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Top states by sessions">
          <ChartFrame height={Math.max(220, data.topStates.length * 22)}>
            <BarChart data={data.topStates.slice(0, 15)} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid {...GRID} />
              <XAxis type="number" tick={TICK} />
              <YAxis dataKey="state" type="category" tick={TICK} width={90} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#a78bfa" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
        <Card title="Top pincodes by searches">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-[11px] uppercase tracking-wider">
                <th className="text-left py-2">Pincode</th>
                <th className="text-right py-2">Searches</th>
              </tr>
            </thead>
            <tbody>
              {data.topPincodes.map((r: any) => (
                <tr key={r.pincode} className="border-t border-overlay-5">
                  <td className="py-1.5 font-mono">{r.pincode}</td>
                  <td className="py-1.5 text-right">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card
        title="Jan Aushadhi proximity"
        hint="Kendras and search-volume per state"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider">
              <th className="text-left py-2">State</th>
              <th className="text-right py-2">Kendras</th>
              <th className="text-right py-2">Sessions</th>
              <th className="text-right py-2">Sessions / Kendra</th>
            </tr>
          </thead>
          <tbody>
            {data.jaCoverageByState
              .sort((a: any, b: any) => b.sessions - a.sessions)
              .slice(0, 15)
              .map((r: any) => (
                <tr key={r.state} className="border-t border-overlay-5">
                  <td className="py-1.5">{r.state}</td>
                  <td className="py-1.5 text-right">{r.kendras}</td>
                  <td className="py-1.5 text-right">{r.sessions}</td>
                  <td className="py-1.5 text-right text-text-secondary">
                    {r.kendras > 0 ? (r.sessions / r.kendras).toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ───────────── MEDICINES ───────────── */

export function MedicinesPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("medicines", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat label="Total searches w/ catalog match" value={data.totalSearches} />
        <BigStat label="Prescription required" value={formatPct(data.rxRate)} />
        <BigStat label="Catalog-only (no prices)" value={formatPct(data.catalogOnlyRate)} />
        <BigStat label="Out-of-stock impressions" value={formatPct(data.oosRate)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Top medicines">
          <table className="w-full text-sm">
            <tbody>
              {data.topMedicines.map((m: any, i: number) => (
                <tr key={m.id} className="border-t border-overlay-5 first:border-t-0">
                  <td className="py-1.5 text-text-muted w-6">{i + 1}</td>
                  <td className="py-1.5 truncate max-w-[260px]">{m.name}</td>
                  <td className="py-1.5 text-right">{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Categories">
          <ChartFrame height={Math.max(220, data.categories.length * 22)}>
            <BarChart data={data.categories.slice(0, 12)} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid {...GRID} />
              <XAxis type="number" tick={TICK} />
              <YAxis dataKey="key" type="category" tick={TICK} width={120} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#34d399" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Dosage forms">
          <ChartFrame height={220}>
            <PieChart>
              <Pie data={data.dosageForms.slice(0, 8).map((d: any) => ({ name: d.key, value: d.count }))} dataKey="value" nameKey="name" outerRadius={80} label={{ fontSize: 10, fill: "#e7e9f1" }}>
                {data.dosageForms.slice(0, 8).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            </PieChart>
          </ChartFrame>
        </Card>
        <Card title="Top manufacturers">
          <ul className="text-sm space-y-1">
            {data.manufacturers.slice(0, 10).map((r: any) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span className="truncate text-text-secondary">{r.key}</span>
                <span>{r.count}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Top salts">
          <ul className="text-sm space-y-1">
            {data.salts.slice(0, 10).map((r: any) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span className="truncate text-text-secondary text-xs">{r.key}</span>
                <span>{r.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── SEARCH ───────────── */

export function SearchPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("search", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat label="Total searches" value={data.total} />
        <BigStat label="Zero-result rate" value={formatPct(data.zeroResultRate)} />
        <BigStat label="Autocomplete pick" value={formatPct(data.autocompletePickedRate)} />
        <BigStat label="Refined searches" value={formatPct(data.refinedRate)} sub="within 30s of prior" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat label="Median results" value={data.medianResults} />
        <BigStat label="JA match rate" value={formatPct(data.jaMatchRate)} />
        <BigStat label="Search latency p50" value={formatMs(data.latencyMsP50)} />
        <BigStat label="Search latency p95" value={formatMs(data.latencyMsP95)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Input method">
          <ChartFrame height={220}>
            <BarChart data={data.inputMethods}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="method" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#fbbf24" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
        <Card
          title="Multi-medicine sessions"
          hint={`${data.multiMedicineTotalSessions} sessions w/ ≥1 medicine`}
        >
          <ChartFrame height={220}>
            <BarChart data={bucketsToRows(data.multiMedicineSessions)}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="key" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#a78bfa" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
      </div>

      <Card title="Top zero-result queries (product backlog)">
        {data.zeroResultQueries.length === 0 ? (
          <div className="text-sm text-text-muted py-4">None — every search found a match.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-[11px] uppercase tracking-wider">
                <th className="text-left py-2">Query</th>
                <th className="text-right py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.zeroResultQueries.map((r: any) => (
                <tr key={r.query} className="border-t border-overlay-5">
                  <td className="py-1.5 font-mono text-xs">{r.query}</td>
                  <td className="py-1.5 text-right">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ───────────── CLICKS ───────────── */

export function ClicksPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("clicks", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  const ctr = data.sessionsWithSearch ? Math.round((data.clickThroughSessions / data.sessionsWithSearch) * 10000) / 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat label="Total clicks" value={data.totalClicks} />
        <BigStat label="Click-through sessions" value={`${ctr}%`} sub={`${data.clickThroughSessions} / ${data.sessionsWithSearch}`} />
        <BigStat label="Cross-pharmacy compare" value={formatPct(data.crossPharmacyRate)} sub={`${data.crossPharmacySessions} sessions`} />
        <BigStat label="Cheapest-shown CTR" value={formatPct(data.cheapestShownCTR)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <BigStat label="Time-to-click p50" value={formatMs(data.ttfcMsP50)} />
        <BigStat label="Time-to-click p95" value={formatMs(data.ttfcMsP95)} />
        <BigStat label="Estimated savings" value={`₹${data.estimatedSavingsRupees.toLocaleString("en-IN")}`} sub="MRP − clicked price" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Clicks-per-session bucket">
          <ChartFrame height={220}>
            <BarChart data={bucketsToRows(data.sessionClickBuckets)}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="key" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#a78bfa" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
        <Card title="Click position">
          <ChartFrame height={220}>
            <BarChart data={bucketsToRows(data.positionHistogram)}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="key" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#34d399" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
      </div>

      <Card title="Pharmacy leaderboard">
        <ChartFrame height={Math.max(180, data.pharmacyLeaderboard.length * 32)}>
          <BarChart data={data.pharmacyLeaderboard} layout="vertical" margin={{ left: 40 }}>
            <CartesianGrid {...GRID} />
            <XAxis type="number" tick={TICK} />
            <YAxis dataKey="pharmacy" type="category" tick={TICK} width={80} />
            <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            <Bar dataKey="clicks" fill="#fbbf24" radius={4} />
          </BarChart>
        </ChartFrame>
      </Card>
    </div>
  );
}

/* ───────────── UPLOADS ───────────── */

export function UploadsPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("uploads", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat label="Total uploads" value={data.total} />
        <BigStat label="Unique users" value={data.uniqueUsers} />
        <BigStat label="Adoption" value={formatPct(data.adoptionRate)} sub="of sessions used upload" />
        <BigStat label="Success rate" value={formatPct(data.successRate)} sub="≥1 med extracted" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
        <BigStat label="Gemini latency p50" value={formatMs(data.latencyMsP50)} />
        <BigStat label="Gemini latency p95" value={formatMs(data.latencyMsP95)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Medicines extracted per upload">
          <ChartFrame height={220}>
            <BarChart data={bucketsToRows(data.medsExtracted)}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="key" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#60a5fa" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
        <Card title="File mime types">
          <ChartFrame height={220}>
            <PieChart>
              <Pie data={data.mimeTypes.map((m: any) => ({ name: m.mime, value: m.count }))} dataKey="value" nameKey="name" outerRadius={80} label={{ fontSize: 10, fill: "#e7e9f1" }}>
                {data.mimeTypes.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            </PieChart>
          </ChartFrame>
        </Card>
      </div>

      {data.recentErrors.length > 0 && (
        <Card title="Recent errors">
          <ul className="text-xs text-red-300 space-y-1 max-h-48 overflow-auto">
            {data.recentErrors.map((e: any, i: number) => (
              <li key={i} className="border-t border-overlay-5 pt-1">
                <span className="text-text-muted">{new Date(e.ts).toLocaleString()}</span> — {e.error}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ───────────── JAN AUSHADHI ───────────── */

export function JanAushadhiPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("jaushadhi", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat label="JA match offer rate" value={formatPct(data.matchOfferRate)} sub={`${data.matched} / ${data.matched + data.notMatched}`} />
        <BigStat label="JA click share" value={formatPct(data.jaClickShare)} sub={`${data.jaClicks} JA / ${data.jaClicks + data.nonJaClicks} total`} />
        <BigStat label="JA matcher coverage" value={formatPct(data.coverage.coverageRate)} sub={`${data.coverage.mapped} / ${data.coverage.totalNonCatalog}`} />
        <BigStat label="Total kendras tracked" value={data.storesByState.reduce((s: number, r: any) => s + r.kendras, 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Match-confidence distribution">
          <ChartFrame height={220}>
            <PieChart>
              <Pie data={data.confidence.map((c: any) => ({ name: c.confidence, value: c.count }))} dataKey="value" nameKey="name" outerRadius={80} label={{ fontSize: 10, fill: "#e7e9f1" }}>
                {data.confidence.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            </PieChart>
          </ChartFrame>
        </Card>
        <Card title="Locator events">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Sessions using locator</span>
              <span>{data.locator.sessions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Region searches</span>
              <span>{data.locator.searches}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Geo requested</span>
              <span>{data.locator.geoRequests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Geo grant rate</span>
              <span>{formatPct(data.locator.geoGrantRate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Geo denied</span>
              <span>{data.locator.geoDenied}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Distance to nearest kendra (proximity)">
        <ChartFrame height={220}>
          <BarChart data={bucketsToRows(data.locator.nearestBuckets)}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="key" tick={TICK} />
            <YAxis tick={TICK} />
            <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            <Bar dataKey="count" fill="#34d399" radius={4} />
          </BarChart>
        </ChartFrame>
      </Card>

      <Card title="Kendras by state (coverage)">
        <ChartFrame height={Math.max(220, data.storesByState.length * 14)}>
          <BarChart data={data.storesByState} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid {...GRID} />
            <XAxis type="number" tick={TICK} />
            <YAxis dataKey="state" type="category" tick={{ ...TICK, fontSize: 10 }} width={120} />
            <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
            <Bar dataKey="kendras" fill="#a78bfa" radius={3} />
          </BarChart>
        </ChartFrame>
      </Card>
    </div>
  );
}

/* ───────────── PRICING ───────────── */

export function PricingPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("pricing", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <BigStat label="Total listings" value={data.totalListings} />

      <Card title="Top price-spread medicines (where MedPrice saves users the most)">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider">
              <th className="text-left py-2">Medicine</th>
              <th className="text-right py-2">Min</th>
              <th className="text-right py-2">Max</th>
              <th className="text-right py-2">Spread</th>
              <th className="text-right py-2">Pharmacies</th>
            </tr>
          </thead>
          <tbody>
            {data.topSpreads.map((s: any) => (
              <tr key={s.name} className="border-t border-overlay-5">
                <td className="py-1.5 truncate max-w-[280px]">{s.name}</td>
                <td className="py-1.5 text-right">₹{s.min}</td>
                <td className="py-1.5 text-right">₹{s.max}</td>
                <td className="py-1.5 text-right font-medium text-emerald-300">₹{s.spread}</td>
                <td className="py-1.5 text-right">{s.pharmacies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Cheapest-wins per pharmacy">
          <ChartFrame height={220}>
            <BarChart data={data.cheapestWins} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid {...GRID} />
              <XAxis type="number" tick={TICK} />
              <YAxis dataKey="pharmacy" type="category" tick={TICK} width={80} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#34d399" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
        <Card title="Discount distribution">
          <ChartFrame height={220}>
            <BarChart data={bucketsToRows(data.discountDistribution)}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="key" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip contentStyle={{ background: "#1a1525", border: "1px solid #2a2440", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#fbbf24" radius={4} />
            </BarChart>
          </ChartFrame>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── OPS ───────────── */

export function OpsPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("ops", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card title="Scrape jobs by pharmacy">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider">
              <th className="text-left py-2">Pharmacy</th>
              <th className="text-right py-2">Success</th>
              <th className="text-right py-2">Failed</th>
              <th className="text-right py-2">Running</th>
              <th className="text-right py-2">Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.scrapeByPharmacy.map((r: any) => (
              <tr key={r.pharmacy} className="border-t border-overlay-5">
                <td className="py-1.5">{r.pharmacy}</td>
                <td className="py-1.5 text-right text-emerald-300">{r.ok}</td>
                <td className="py-1.5 text-right text-red-300">{r.failed}</td>
                <td className="py-1.5 text-right">{r.running}</td>
                <td className="py-1.5 text-right">{r.successRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data.routeLatency.length > 0 && (
        <Card title="API route latency (sampled)">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-[11px] uppercase tracking-wider">
                <th className="text-left py-2">Route</th>
                <th className="text-right py-2">p50</th>
                <th className="text-right py-2">p95</th>
                <th className="text-right py-2">Calls</th>
              </tr>
            </thead>
            <tbody>
              {data.routeLatency.map((r: any) => (
                <tr key={r.route} className="border-t border-overlay-5">
                  <td className="py-1.5 font-mono text-xs">{r.route}</td>
                  <td className="py-1.5 text-right">{formatMs(r.p50)}</td>
                  <td className="py-1.5 text-right">{formatMs(r.p95)}</td>
                  <td className="py-1.5 text-right">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data.recentScrapeFailures.length > 0 && (
        <Card title="Recent scrape failures">
          <ul className="text-xs space-y-1 max-h-48 overflow-auto">
            {data.recentScrapeFailures.map((f: any, i: number) => (
              <li key={i} className="border-t border-overlay-5 pt-1">
                <span className="text-text-muted">{new Date(f.startedAt).toLocaleString()}</span>{" "}
                <span className="text-purple-300">{f.pharmacy}</span> —{" "}
                <span className="text-red-300">{f.errorMessage}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ───────────── FUNNEL ───────────── */

export function FunnelPanel(props: PanelProps) {
  const { data, loading, error } = usePanel<any>("funnel", props);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock error={error} />;
  if (!data) return null;

  const steps = [
    { label: "Landed", value: data.landed },
    { label: "Searched", value: data.searched },
    { label: "Got results", value: data.gotResults },
    { label: "Clicked pharmacy", value: data.clicked },
  ];
  const base = data.landed || 1;

  return (
    <Card title="Conversion funnel" hint="% of landing sessions">
      <div className="space-y-3">
        {steps.map((s, i) => {
          const pct = Math.round((s.value / base) * 1000) / 10;
          const drop = i > 0 ? Math.round(((steps[i - 1].value - s.value) / (steps[i - 1].value || 1)) * 1000) / 10 : null;
          return (
            <div key={s.label}>
              <div className="flex justify-between text-sm mb-1">
                <span>{s.label}</span>
                <span className="font-mono">
                  {s.value} <span className="text-text-muted">({pct}%)</span>
                </span>
              </div>
              <div className="h-3 rounded-full bg-overlay-5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 1) % COLORS.length]})`,
                  }}
                />
              </div>
              {drop !== null && (
                <div className="text-[11px] text-text-muted mt-1">↓ −{drop}% from previous step</div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────────── LIVE STRIP ───────────── */

export function LiveStrip({ user, password }: { user: string; password: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/admin/metrics/live", {
          headers: { "x-admin-user": user, "x-admin-password": password },
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user, password]);

  if (!data) {
    return (
      <div className="glass-card p-3 text-xs text-text-muted">
        Live tiles {error ? `(${error})` : "loading…"}
      </div>
    );
  }

  const tiles = [
    { label: "Searches/60s", value: data.searches60s, accent: "text-purple-300" },
    { label: "Clicks/60s", value: data.clicks60s, accent: "text-emerald-300" },
    { label: "Active sessions", value: data.activeSessions, accent: "text-cyan-300", sub: "last 5 min" },
    { label: "Uploads/hr", value: data.uploads1h, accent: "text-amber-300" },
    { label: "Top medicine (15m)", value: data.topMedicine?.name ?? "—", sub: data.topMedicine?.count != null ? `${data.topMedicine.count}×` : undefined, accent: "text-pink-300", isText: true },
    { label: "Top pincode (15m)", value: data.topPincode?.pincode ?? "—", sub: data.topPincode?.count != null ? `${data.topPincode.count}×` : undefined, accent: "text-blue-300" },
    { label: "5xx (1h)", value: data.errors1h, accent: data.errors1h > 0 ? "text-red-300" : "text-emerald-300" },
  ];

  return (
    <div className="glass-card p-3 flex items-center gap-2 overflow-x-auto">
      <div className="flex items-center gap-1.5 shrink-0 px-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Live</span>
      </div>
      {tiles.map((t, i) => (
        <div key={i} className="flex-shrink-0 px-3 py-1 border-l border-overlay-5 first:border-l-0">
          <div className="text-[10px] uppercase tracking-wider text-text-muted">{t.label}</div>
          <div className={`font-display font-bold ${t.isText ? "text-sm truncate max-w-[140px]" : "text-lg"} ${t.accent}`} title={String(t.value)}>
            {t.value}
          </div>
          {t.sub && <div className="text-[10px] text-text-muted">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
