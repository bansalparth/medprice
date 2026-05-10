"use client";

import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";

function Counter({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to]);

  return <span ref={ref}>{val}</span>;
}

export function JanAushadhiSpotlight() {
  return (
    <section className="px-4 py-20 max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-emerald-900/20 to-transparent p-8 md:p-12">
        <div className="hero-blob bg-emerald-500/20 w-[400px] h-[400px] -top-20 -right-20" />

        <div className="relative grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium mb-5">
              <Heart size={12} fill="currentColor" /> The biggest savings nobody talks about
            </div>
            <div className="font-display font-bold text-6xl md:text-7xl gradient-text-green leading-none">
              Save up to <Counter to={90} />%
            </div>
            <p className="mt-3 text-text-secondary">
              At Jan Aushadhi Kendras — the same molecule, much cheaper.
            </p>
            <Link
              href="/jan-aushadhi"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-ink-950 font-semibold hover:bg-emerald-400 transition-colors"
            >
              Find a store near me
            </Link>
          </div>

          <div className="space-y-3 text-text-secondary text-sm leading-relaxed">
            <p>
              <strong className="text-white">Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP)</strong>{" "}
              is a Government of India initiative providing quality generic medicines at affordable prices through over 10,000 dedicated stores nationwide.
            </p>
            <p>
              Every product is sourced from BPPI-approved manufacturers, tested for quality, and priced 50–90% below private brands. MedPrice is the only comparison platform that surfaces these prices.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-4">
              {[
                { v: "10,000+", l: "Stores" },
                { v: "1,800+", l: "Products" },
                { v: "70%", l: "Avg. Savings" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-xl bg-overlay-5 border border-overlay-5 p-3 text-center"
                >
                  <div className="font-display font-bold text-lg gradient-text-green">
                    {s.v}
                  </div>
                  <div className="text-[11px] text-text-muted uppercase tracking-wider mt-1">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
