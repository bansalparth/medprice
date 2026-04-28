"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { PrescriptionUploadModal } from "@/components/search/PrescriptionUploadModal";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ScanLine, Sparkles } from "lucide-react";

export default function UploadPage() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="font-display font-bold text-4xl mb-3">
            Snap your <span className="gradient-text">prescription</span>
          </h1>
          <p className="text-text-secondary max-w-md mx-auto">
            Our AI reads handwritten and printed prescriptions, extracts every
            medicine, and compares prices for the lot.
          </p>
        </motion.div>

        <div className="glass-card p-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-purple-400/10 mb-6">
            <Camera size={36} className="text-purple-400" />
          </div>
          <p className="font-display text-xl mb-6">
            Upload a clear photo of your prescription
          </p>
          <button
            onClick={() => setOpen(true)}
            className="px-6 py-3 rounded-xl bg-purple-400 text-ink-950 font-semibold hover:bg-purple-300 transition-colors inline-flex items-center gap-2"
          >
            <ScanLine size={16} /> Choose Image
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mt-6">
          <div className="glass-card p-5">
            <Sparkles className="text-purple-400 mb-3" size={18} />
            <div className="font-medium mb-1">AI-powered OCR</div>
            <div className="text-sm text-text-secondary">
              Powered by Gemini Vision — handles handwriting, multiple medicines
              per page, and rotated images.
            </div>
          </div>
          <div className="glass-card p-5">
            <ScanLine className="text-purple-400 mb-3" size={18} />
            <div className="font-medium mb-1">Privacy-first</div>
            <div className="text-sm text-text-secondary">
              Patient and doctor names are stripped. Images are stored locally
              for processing only.
            </div>
          </div>
        </div>

        <AnimatePresence>
          {open && <PrescriptionUploadModal onClose={() => setOpen(false)} />}
        </AnimatePresence>
      </main>
    </>
  );
}
