"use client";

import { motion } from "framer-motion";
import { Pill, Camera, MapPin } from "lucide-react";

const STEPS = [
  {
    icon: Pill,
    title: "Search or photograph",
    desc: "Type, speak, or snap a photo of your prescription. Our AI extracts every medicine.",
  },
  {
    icon: Camera,
    title: "Compare across 7 sources",
    desc: "Live price check across India's 6 biggest pharmacies plus Jan Aushadhi government stores.",
  },
  {
    icon: MapPin,
    title: "Save up to 90%",
    desc: "Buy online cheap, or find your nearest Jan Aushadhi Kendra for the lowest price possible.",
  },
];

export function HowItWorks() {
  return (
    <section className="px-4 py-20 max-w-6xl mx-auto">
      <motion.h2
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-display font-bold text-3xl md:text-4xl text-center mb-3"
      >
        How it works
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-text-secondary text-center mb-12"
      >
        Three steps to the lowest price for your meds.
      </motion.p>

      <div className="grid md:grid-cols-3 gap-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-400/10 flex items-center justify-center">
                  <Icon size={18} className="text-purple-400" />
                </div>
                <span className="text-text-muted text-xs font-mono">
                  STEP {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="font-display font-semibold text-xl mb-2">
                {s.title}
              </h3>
              <p className="text-text-secondary text-sm leading-relaxed">
                {s.desc}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
