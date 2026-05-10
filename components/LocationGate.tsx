"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Loader2, ShieldCheck, Lock, Search } from "lucide-react";
import { useLocation } from "@/lib/location-context";

/**
 * Full-screen overlay that blocks the app until the user grants location.
 * Shows the actual app underneath when location is set.
 */
export function LocationGate({ children }: { children: React.ReactNode }) {
  const { location, loading, error, request, openPicker } = useLocation();
  const granted = !!location;

  return (
    <>
      {children}
      <AnimatePresence>
        {!granted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            style={{
              background:
                "radial-gradient(circle at 50% 30%, rgba(46,16,101,0.92), rgba(6,4,13,0.98) 60%)",
              backdropFilter: "blur(8px)",
            }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", damping: 22, stiffness: 200 }}
              className="glass-card-static max-w-md w-full p-8 text-center relative overflow-hidden"
            >
              {/* Animated halo */}
              <motion.div
                className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(167,139,250,0.4), transparent 60%)",
                  filter: "blur(40px)",
                }}
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 4, repeat: Infinity }}
              />

              <div className="relative z-10">
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity }}
                  className="w-16 h-16 rounded-2xl mx-auto mb-5 bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/30"
                >
                  <MapPin size={28} className="text-white" />
                </motion.div>

                <h1 className="font-display font-bold text-2xl mb-3">
                  We need your <span className="gradient-text">location</span>
                </h1>
                <p className="text-text-secondary text-sm mb-6 leading-relaxed">
                  Medicine prices and stock vary by city. To show you accurate
                  results from pharmacies that deliver to you, we need your location.
                </p>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300"
                  >
                    {error}
                  </motion.div>
                )}

                <button
                  onClick={request}
                  disabled={loading}
                  className="btn-primary w-full py-3 rounded-xl font-display flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Detecting location...
                    </>
                  ) : (
                    <>
                      <MapPin size={16} />
                      Share my location
                    </>
                  )}
                </button>

                <button
                  onClick={openPicker}
                  className="mt-2 w-full py-2.5 rounded-xl border border-overlay-10 hover:border-purple-400/40 bg-overlay-5 hover:bg-purple-500/10 transition-colors text-sm flex items-center justify-center gap-2 text-text-secondary hover:text-silver-100"
                >
                  <Search size={14} />
                  Enter city or pincode manually
                </button>

                <div className="mt-6 grid grid-cols-2 gap-3 text-left">
                  <div className="flex items-start gap-2">
                    <ShieldCheck size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium">Stays local</div>
                      <div className="text-[10px] text-text-muted">
                        Stored only in your browser
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Lock size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium">Never sold</div>
                      <div className="text-[10px] text-text-muted">
                        We don't share with anyone
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
