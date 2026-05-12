"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Camera, Pill, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PrescriptionUploadModal } from "./PrescriptionUploadModal";
import { apiFetch } from "@/lib/api-client";

interface MedSuggestion {
  id: string;
  name: string;
  brandName: string | null;
  manufacturer: string | null;
  saltComposition: string | null;
  dosageForm: string | null;
  packSize: string | null;
  category: string | null;
  isCatalog: boolean;
}

const PLACEHOLDERS = [
  "Search Crocin Advance...",
  "Search Dolo 650...",
  "Search Glycomet 500...",
  "Search Pan 40...",
  "Search Telma 40...",
];

export function SearchBar({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const [suggestions, setSuggestions] = useState<MedSuggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // In-flight fetch controller — aborted on every new keystroke so the
  // dropdown always reflects the latest input, never a slow stale response.
  const abortRef = useRef<AbortController | null>(null);
  // Suppress the next debounced fetch — used after a programmatic value
  // change (autocomplete pick or initialValue sync) so we don't re-open
  // the dropdown immediately.
  const skipNextFetchRef = useRef(false);

  // Sync value when initialValue prop changes (e.g., URL changed via client nav)
  useEffect(() => {
    skipNextFetchRef.current = true;
    setValue(initialValue);
    setNavigating(false);
  }, [initialValue]);

  // Cycle placeholders
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % PLACEHOLDERS.length;
      setPlaceholder(PLACEHOLDERS[i]);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Click outside closes suggestions
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setShowSuggest(false);
        setHoverIdx(-1);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const fetchSuggestions = async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    // Cancel any in-flight request — the user has typed something newer.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const r = await apiFetch(
        `/api/medicines/search?q=${encodeURIComponent(q.trim())}&limit=10`,
        { signal: ctrl.signal }
      );
      const d = await r.json();
      // If this request was aborted between fetch resolving and now, bail.
      if (ctrl.signal.aborted) return;
      setSuggestions(d.results ?? []);
      setShowSuggest(true);
      setHoverIdx(-1);
    } catch (e: any) {
      // AbortError is expected on rapid typing — swallow silently.
      if (e?.name !== "AbortError") {
        console.error("[autocomplete] fetch failed:", e);
      }
    } finally {
      // Only clear loading state for the *current* request — older aborts
      // may resolve out of order.
      if (abortRef.current === ctrl) setLoading(false);
    }
  };

  // Debounced fetch on value change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const pick = (s: MedSuggestion) => {
    // Mirror what the dropdown row showed — `s.name` (e.g. "Dolo 650 Tablet")
    // — not the short brand alone. Using the full name also gives scrapers
    // a more specific query, so filtering rejects fewer relevant cross-sells.
    const display = s.name;
    skipNextFetchRef.current = true;
    setValue(display);
    setSuggestions([]);
    setShowSuggest(false);
    setNavigating(true);
    inputRef.current?.blur();
    router.push(
      `/search?medicineId=${s.id}&q=${encodeURIComponent(display)}`
    );
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = hoverIdx >= 0 ? hoverIdx : 0;
      pick(suggestions[idx]);
    } else if (e.key === "Escape") {
      setShowSuggest(false);
    }
  };

  return (
    <>
      <div ref={wrapRef} className="relative z-50">
        <div className="search-input glass-card flex items-center gap-1 px-4 py-2.5 transition-all">
          {navigating ? (
            <Loader2 size={20} className="text-purple-400 shrink-0 animate-spin" />
          ) : (
            <Search size={20} className="text-text-secondary shrink-0" />
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggest(true);
              } else if (value.trim().length >= 2) {
                fetchSuggestions(value);
              }
            }}
            onKeyDown={onKey}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 bg-transparent border-0 px-2 py-2 text-base placeholder:text-text-muted"
            aria-label="Search medicine"
          />
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="p-2.5 rounded-full text-text-secondary hover:text-purple-300 hover:bg-overlay-5 transition-colors"
            title="Upload prescription"
            aria-label="Upload prescription"
          >
            <Camera size={18} />
          </button>
        </div>

        <AnimatePresence>
          {showSuggest && (suggestions.length > 0 || loading) && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 mt-2 z-40 glass-card-static overflow-hidden"
              style={{ maxHeight: "60vh", overflowY: "auto" }}
            >
              {loading && suggestions.length === 0 && (
                <div className="px-4 py-3 text-sm text-text-secondary">
                  Searching...
                </div>
              )}
              {suggestions.length === 0 && !loading && value.trim().length >= 2 && (
                <div className="px-4 py-6 text-center text-sm text-text-secondary">
                  No medicine found in our catalog. Try a different brand.
                </div>
              )}
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pick(s)}
                  onMouseEnter={() => setHoverIdx(i)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-overlay-5 last:border-0 ${
                    hoverIdx === i ? "bg-purple-500/10" : "hover:bg-overlay-5"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      s.isCatalog
                        ? "bg-purple-500/15 text-purple-300"
                        : "bg-overlay-5 text-text-secondary"
                    }`}
                  >
                    <Pill size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span>{s.name}</span>
                      {s.dosageForm && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-overlay-5 text-text-secondary">
                          {s.dosageForm}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary truncate">
                      {s.saltComposition ?? "Salt composition not yet linked"}
                      {s.manufacturer && ` · ${s.manufacturer}`}
                    </div>
                  </div>
                  {s.packSize && (
                    <div className="text-[11px] text-text-muted shrink-0 hidden sm:block">
                      {s.packSize}
                    </div>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showUpload && (
          <PrescriptionUploadModal onClose={() => setShowUpload(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
