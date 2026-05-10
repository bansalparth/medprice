"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

export function RecentSearches() {
  const [searches, setSearches] = useState<{ query: string; count: number }[]>([]);

  useEffect(() => {
    apiFetch("/api/recent-searches")
      .then((r) => r.json())
      .then((d) => setSearches(d.searches ?? []))
      .catch(() => {});
  }, []);

  if (searches.length === 0) return null;

  return (
    <section className="px-4 pb-20 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-4 text-text-secondary">
        <Clock size={14} />
        <span className="text-sm uppercase tracking-wider font-medium">
          Recently searched
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {searches.map((s) => (
          <Link
            key={s.query}
            href={`/search?q=${encodeURIComponent(s.query)}`}
            className="px-4 py-2 rounded-full bg-overlay-5 border border-overlay-10 text-sm hover:border-purple-400 hover:text-purple-400 transition-colors"
          >
            {s.query}
          </Link>
        ))}
      </div>
    </section>
  );
}
