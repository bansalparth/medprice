"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Lock, Play, RefreshCw, Loader2 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import {
  TrafficPanel,
  GeographyPanel,
  MedicinesPanel,
  SearchPanel,
  ClicksPanel,
  UploadsPanel,
  JanAushadhiPanel,
  PricingPanel,
  OpsPanel,
  FunnelPanel,
  LiveStrip,
} from "@/components/admin/MetricsPanels";

type Window = "1h" | "24h" | "7d" | "30d";
type Tab =
  | "overview"
  | "traffic"
  | "geography"
  | "medicines"
  | "search"
  | "clicks"
  | "uploads"
  | "jaushadhi"
  | "pricing"
  | "ops";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "traffic", label: "Traffic" },
  { key: "geography", label: "Geography" },
  { key: "medicines", label: "Medicines" },
  { key: "search", label: "Search" },
  { key: "clicks", label: "Clicks" },
  { key: "uploads", label: "Uploads" },
  { key: "jaushadhi", label: "Jan Aushadhi" },
  { key: "pricing", label: "Pricing" },
  { key: "ops", label: "Ops & Scrapes" },
];

const WINDOWS: { key: Window; label: string }[] = [
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

const PHARMACIES = ["all", "1mg", "netmeds", "pharmeasy", "apollo", "truemeds", "mrmed"];

interface Job {
  id: string;
  pharmacy: string;
  startedAt: string;
  completedAt?: string | null;
  medicinesScraped?: number | null;
  status: string;
  errorMessage?: string | null;
}

export default function AdminPage() {
  const [user, setUser] = useState("");
  const [pwd, setPwd] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authChecking, setAuthChecking] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [window, setWindow] = useState<Window>("24h");

  useEffect(() => {
    const savedUser = sessionStorage.getItem("medprice_admin_user");
    const savedPwd = sessionStorage.getItem("medprice_admin");
    if (savedUser && savedPwd) {
      setUser(savedUser);
      setPwd(savedPwd);
      setAuthed(true);
    }
  }, []);

  const submitPwd = async () => {
    if (!user || !pwd) return;
    setAuthChecking(true);
    setAuthError("");
    try {
      const res = await apiFetch("/api/admin/metrics/live", {
        headers: { "x-admin-user": user, "x-admin-password": pwd },
      });
      if (res.status === 401) {
        setAuthError("Wrong username or password");
        sessionStorage.removeItem("medprice_admin");
        sessionStorage.removeItem("medprice_admin_user");
        return;
      }
      sessionStorage.setItem("medprice_admin", pwd);
      sessionStorage.setItem("medprice_admin_user", user);
      setAuthed(true);
    } finally {
      setAuthChecking(false);
    }
  };

  if (!authed) {
    return (
      <>
        <Header />
        <main className="max-w-md mx-auto px-4 py-20">
          <div className="glass-card p-8">
            <div className="flex items-center gap-2 mb-4">
              <Lock size={18} className="text-purple-400" />
              <h1 className="font-display font-bold text-xl">Admin</h1>
            </div>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPwd()}
              placeholder="Username"
              className="w-full px-4 py-3 rounded-xl bg-overlay-5 border border-overlay-10 focus:border-purple-400 outline-none mb-2"
            />
            <input
              type="password"
              autoComplete="current-password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPwd()}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl bg-overlay-5 border border-overlay-10 focus:border-purple-400 outline-none"
            />
            {authError && <div className="text-red-300 text-sm mt-2">{authError}</div>}
            <button
              onClick={submitPwd}
              disabled={authChecking || !user || !pwd}
              className="w-full mt-3 px-4 py-3 rounded-xl bg-purple-400 text-ink-950 font-semibold hover:bg-purple-300 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {authChecking ? <Loader2 className="animate-spin" size={16} /> : "Unlock"}
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="font-display font-bold text-2xl">Admin Dashboard</h1>
          <div className="flex items-center gap-1 glass-card p-1">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setWindow(w.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  window === w.key
                    ? "bg-purple-400 text-ink-950"
                    : "text-text-secondary hover:text-white"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <LiveStrip user={user} password={pwd} />
        </div>

        <div className="flex gap-1 mb-4 overflow-x-auto border-b border-overlay-5 pb-px">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? "border-purple-400 text-white"
                  : "border-transparent text-text-secondary hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pb-12">
          {tab === "overview" && (
            <div className="space-y-4">
              <FunnelPanel user={user} password={pwd} window={window} />
              <TrafficPanel user={user} password={pwd} window={window} />
            </div>
          )}
          {tab === "traffic" && <TrafficPanel user={user} password={pwd} window={window} />}
          {tab === "geography" && <GeographyPanel user={user} password={pwd} window={window} />}
          {tab === "medicines" && <MedicinesPanel user={user} password={pwd} window={window} />}
          {tab === "search" && <SearchPanel user={user} password={pwd} window={window} />}
          {tab === "clicks" && <ClicksPanel user={user} password={pwd} window={window} />}
          {tab === "uploads" && <UploadsPanel user={user} password={pwd} window={window} />}
          {tab === "jaushadhi" && <JanAushadhiPanel user={user} password={pwd} window={window} />}
          {tab === "pricing" && <PricingPanel user={user} password={pwd} window={window} />}
          {tab === "ops" && <OpsAndScrapes user={user} password={pwd} window={window} />}
        </div>
      </main>
    </>
  );
}

function OpsAndScrapes({ user, password, window }: { user: string; password: string; window: Window }) {
  const [scrapeData, setScrapeData] = useState<{
    jobs: Job[];
    topSearches: { query: string; _count: { query: number } }[];
    stats: { totalMedicines: number; totalListings: number; totalStores: number };
  } | null>(null);
  const [triggerQuery, setTriggerQuery] = useState("");
  const [triggerPharmacy, setTriggerPharmacy] = useState("all");
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchScrape = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/scrape-status", {
        headers: { "x-admin-user": user, "x-admin-password": password },
      });
      if (res.ok) setScrapeData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScrape();
  }, [user, password]);

  const trigger = async () => {
    if (!triggerQuery) return;
    setTriggering(true);
    setTriggerResult("");
    try {
      const res = await apiFetch("/api/admin/trigger-scrape", {
        method: "POST",
        headers: {
          "x-admin-user": user,
          "x-admin-password": password,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: triggerQuery, pharmacy: triggerPharmacy }),
      });
      const d = await res.json();
      setTriggerResult(
        res.ok
          ? `OK — ${d.count} listings scraped (job ${d.jobId})`
          : `Error: ${d.error ?? res.status}`
      );
      fetchScrape();
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Medicines</div>
          <div className="font-display font-bold text-3xl">{scrapeData?.stats.totalMedicines ?? "—"}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Listings</div>
          <div className="font-display font-bold text-3xl">{scrapeData?.stats.totalListings ?? "—"}</div>
        </div>
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">JA Stores</div>
          <div className="font-display font-bold text-3xl">{scrapeData?.stats.totalStores ?? "—"}</div>
        </div>
      </div>

      <OpsPanel user={user} password={password} window={window} />

      <div className="glass-card p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider text-text-muted">Trigger scrape</div>
          <button
            onClick={fetchScrape}
            className="text-xs text-text-secondary hover:text-white flex items-center gap-1"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={triggerQuery}
            onChange={(e) => setTriggerQuery(e.target.value)}
            placeholder='Medicine name (e.g. "Crocin 650")'
            className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400 outline-none"
          />
          <select
            value={triggerPharmacy}
            onChange={(e) => setTriggerPharmacy(e.target.value)}
            className="px-3 py-2 rounded-xl bg-overlay-5 border border-overlay-10 text-sm"
          >
            {PHARMACIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={trigger}
            disabled={!triggerQuery || triggering}
            className="px-4 py-2 rounded-xl bg-purple-400 text-ink-950 font-semibold text-sm hover:bg-purple-300 disabled:opacity-50 flex items-center gap-1.5"
          >
            {triggering ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
            Run
          </button>
        </div>
        {triggerResult && <div className="text-xs text-text-secondary mt-2">{triggerResult}</div>}
      </div>

      {scrapeData?.topSearches && scrapeData.topSearches.length > 0 && (
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-3">Top searches (all-time)</div>
          <table className="w-full text-sm">
            <tbody>
              {scrapeData.topSearches.map((r, i) => (
                <tr key={r.query} className="border-t border-overlay-5 first:border-t-0">
                  <td className="py-1.5 text-text-muted w-6">{i + 1}</td>
                  <td className="py-1.5 font-mono text-xs">{r.query}</td>
                  <td className="py-1.5 text-right">{r._count.query}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scrapeData?.jobs && scrapeData.jobs.length > 0 && (
        <div className="glass-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-text-muted mb-3">Recent scrape jobs</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-[10px] uppercase tracking-wider">
                <th className="text-left py-2">When</th>
                <th className="text-left py-2">Pharmacy</th>
                <th className="text-left py-2">Status</th>
                <th className="text-right py-2">Scraped</th>
                <th className="text-left py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {scrapeData.jobs.slice(0, 20).map((j) => (
                <tr key={j.id} className="border-t border-overlay-5">
                  <td className="py-1.5 text-text-muted text-xs">{timeAgo(new Date(j.startedAt))}</td>
                  <td className="py-1.5">{j.pharmacy}</td>
                  <td className={`py-1.5 ${j.status === "success" ? "text-emerald-300" : j.status === "failed" ? "text-red-300" : "text-amber-300"}`}>{j.status}</td>
                  <td className="py-1.5 text-right">{j.medicinesScraped ?? "—"}</td>
                  <td className="py-1.5 text-xs text-red-300 truncate max-w-[260px]">{j.errorMessage ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
