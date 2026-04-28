"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";

export function RecentSearches() {
  const [searches, setSearches] = useState<{ query: string; count: number }[]>([]);

  useEffect(() => {
    fetch("/api/recent-searches")
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
            className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm hover:border-purple-400 hover:text-purple-400 transition-colors"
          >
            {s.query}
          </Link>
        ))}
      </div>
    </section>
  );
}
