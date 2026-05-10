"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { motion } from "framer-motion";
import { Loader2, Lock, Play, RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

interface Job {
  id: string;
  pharmacy: string;
  startedAt: string;
  completedAt?: string | null;
  medicinesScraped?: number | null;
  status: string;
  errorMessage?: string | null;
}

interface AdminData {
  jobs: Job[];
  topSearches: { query: string; _count: { query: number } }[];
  stats: { totalMedicines: number; totalListings: number; totalStores: number };
}

const PHARMACIES = ["all", "1mg", "netmeds", "pharmeasy", "apollo", "truemeds", "mrmed"];

export default function AdminPage() {
  const [pwd, setPwd] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggerQuery, setTriggerQuery] = useState("");
  const [triggerPharmacy, setTriggerPharmacy] = useState("all");
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string>("");

  useEffect(() => {
    const saved = sessionStorage.getItem("medprice_admin");
    if (saved) {
      setPwd(saved);
      setAuthed(true);
    }
  }, []);

  const fetchData = async (password: string) => {
    setLoading(true);
    setAuthError("");
    try {
      const res = await apiFetch("/api/admin/scrape-status", {
        headers: { "x-admin-password": password },
      });
      if (res.status === 401) {
        setAuthError("Wrong password");
        setAuthed(false);
        sessionStorage.removeItem("medprice_admin");
        return;
      }
      const d = await res.json();
      setData(d);
      setAuthed(true);
      sessionStorage.setItem("medprice_admin", password);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) fetchData(pwd);
  }, [authed]);

  const triggerScrape = async () => {
    if (!triggerQuery.trim()) return;
    setTriggering(true);
    setTriggerResult("");
    try {
      const res = await apiFetch("/api/admin/trigger-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": pwd,
        },
        body: JSON.stringify({
          query: triggerQuery.trim(),
          pharmacy: triggerPharmacy,
        }),
      });
      const d = await res.json();
      setTriggerResult(
        res.ok
          ? `Scraped ${d.count} listings`
          : `Failed: ${d.error ?? "unknown"}`
      );
      fetchData(pwd);
    } finally {
      setTriggering(false);
    }
  };

  if (!authed) {
    return (
      <>
        <Header />
        <main className="max-w-md mx-auto px-4 py-20">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <Lock className="text-purple-400" />
              <h1 className="font-display font-bold text-2xl">Admin</h1>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchData(pwd);
              }}
            >
              <input
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                type="password"
                placeholder="Admin password"
                className="w-full px-4 py-3 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400 mb-3"
              />
              {authError && (
                <p className="text-red-400 text-sm mb-3">{authError}</p>
              )}
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-purple-400 text-ink-950 font-semibold hover:bg-purple-300 transition-colors"
              >
                Sign in
              </button>
            </form>
          </motion.div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display font-bold text-3xl">Admin Dashboard</h1>
          <button
            onClick={() => fetchData(pwd)}
            className="px-3 py-2 rounded-lg bg-overlay-5 hover:bg-overlay-10 text-sm flex items-center gap-2"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {loading && (
          <Loader2 className="animate-spin text-purple-400 mx-auto my-12" />
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
              {[
                { l: "Medicines", v: data.stats.totalMedicines },
                { l: "Listings", v: data.stats.totalListings },
                { l: "JA Stores", v: data.stats.totalStores },
              ].map((s) => (
                <div key={s.l} className="glass-card p-5">
                  <div className="text-text-secondary text-xs uppercase tracking-wider">
                    {s.l}
                  </div>
                  <div className="font-display font-bold text-3xl mt-1 gradient-text">
                    {s.v.toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>

            <div className="glass-card p-5 mb-8">
              <h2 className="font-display font-bold text-lg mb-4">
                Trigger Scrape
              </h2>
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={triggerQuery}
                  onChange={(e) => setTriggerQuery(e.target.value)}
                  placeholder="Medicine name (e.g. paracetamol)"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400"
                />
                <select
                  value={triggerPharmacy}
                  onChange={(e) => setTriggerPharmacy(e.target.value)}
                  className="px-4 py-2.5 rounded-xl bg-overlay-5 border border-overlay-10 text-sm focus:border-purple-400"
                >
                  {PHARMACIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  onClick={triggerScrape}
                  disabled={triggering || !triggerQuery.trim()}
                  className="px-4 py-2.5 rounded-xl bg-purple-400 text-ink-950 font-semibold text-sm hover:bg-purple-300 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {triggering ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  Run
                </button>
              </div>
              {triggerResult && (
                <p className="text-sm mt-3 text-text-secondary">{triggerResult}</p>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card p-5">
                <h2 className="font-display font-bold text-lg mb-4">
                  Recent Scrape Jobs
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {data.jobs.length === 0 && (
                    <p className="text-text-secondary text-sm">No jobs yet.</p>
                  )}
                  {data.jobs.map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-overlay-5 text-sm"
                    >
                      <div>
                        <div className="font-medium">{j.pharmacy}</div>
                        <div className="text-text-muted text-xs mt-0.5">
                          {timeAgo(j.startedAt)} · {j.medicinesScraped ?? "—"}{" "}
                          listings
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          j.status === "success"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : j.status === "failed"
                            ? "bg-red-500/10 text-red-300"
                            : "bg-yellow-500/10 text-yellow-300"
                        }`}
                      >
                        {j.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-5">
                <h2 className="font-display font-bold text-lg mb-4">
                  Top Searches
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {data.topSearches.length === 0 && (
                    <p className="text-text-secondary text-sm">
                      No searches yet.
                    </p>
                  )}
                  {data.topSearches.map((s) => (
                    <div
                      key={s.query}
                      className="flex items-center justify-between p-3 rounded-lg bg-overlay-5 text-sm"
                    >
                      <span className="truncate">{s.query}</span>
                      <span className="text-text-muted text-xs">
                        {s._count.query}×
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
