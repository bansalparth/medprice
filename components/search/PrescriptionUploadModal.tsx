"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Camera, X, Loader2, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

type Step = "idle" | "uploading" | "processing" | "done" | "error";

export function PrescriptionUploadModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("idle");
  const [medicines, setMedicines] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragging, setDragging] = useState(false);
  const router = useRouter();

  const processFile = async (file: File) => {
    setStep("uploading");
    const formData = new FormData();
    formData.append("image", file);

    try {
      setStep("processing");
      const res = await apiFetch("/api/ocr", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Upload failed");
        setStep("error");
        return;
      }
      setMedicines(data.medicines ?? []);
      setConfidence(data.confidence ?? "low");
      setStep("done");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Network error");
      setStep("error");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const searchAll = () => {
    if (medicines.length === 0) return;
    if (medicines.length === 1) {
      router.push(
        `/search?q=${encodeURIComponent(medicines[0])}&method=prescription_photo`
      );
    } else {
      router.push(
        `/search?q=${encodeURIComponent(medicines[0])}&batch=${encodeURIComponent(
          medicines.slice(1).join(",")
        )}&method=prescription_photo`
      );
    }
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="glass-card w-full max-w-md p-6 bg-[var(--bg-primary)]/95"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-display text-xl font-bold">Upload Prescription</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-white p-1 rounded-lg hover:bg-overlay-5"
          >
            <X size={20} />
          </button>
        </div>

        {step === "idle" && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
              dragging
                ? "border-purple-400 bg-purple-400/5"
                : "border-overlay-10 hover:border-white/20"
            }`}
            onClick={() =>
              document.getElementById("prescription-input")?.click()
            }
          >
            <Camera size={40} className="mx-auto mb-3 text-purple-400" />
            <p className="font-medium mb-1">Drop prescription image here</p>
            <p className="text-text-secondary text-sm">
              or click to browse — JPG, PNG, WebP
            </p>
            <input
              id="prescription-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) processFile(e.target.files[0]);
              }}
            />
          </div>
        )}

        {(step === "uploading" || step === "processing") && (
          <div className="text-center py-12">
            <Loader2
              size={40}
              className="mx-auto mb-4 text-purple-400 animate-spin"
            />
            <p className="font-medium">
              {step === "uploading"
                ? "Uploading..."
                : "Reading prescription with AI..."}
            </p>
            <p className="text-text-secondary text-sm mt-1">
              Powered by Gemini Vision
            </p>
          </div>
        )}

        {step === "done" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle size={20} className="text-accent-green" />
              <span className="font-medium">
                Found {medicines.length} medicine
                {medicines.length !== 1 ? "s" : ""}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ml-auto ${
                  confidence === "high"
                    ? "bg-green-500/10 text-green-400"
                    : confidence === "medium"
                    ? "bg-yellow-500/10 text-yellow-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {confidence} confidence
              </span>
            </div>
            {medicines.length === 0 ? (
              <div className="text-center py-6 text-text-secondary">
                No medicines detected. Try a clearer photo.
              </div>
            ) : (
              <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                {medicines.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-3 rounded-lg bg-overlay-5"
                  >
                    <span className="text-text-secondary text-sm w-5">
                      {i + 1}.
                    </span>
                    <span className="flex-1">{m}</span>
                    <button
                      onClick={() =>
                        setMedicines((prev) =>
                          prev.filter((_, j) => j !== i)
                        )
                      }
                      className="text-text-muted hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {medicines.length > 0 && (
              <button
                onClick={searchAll}
                className="w-full py-3 rounded-xl bg-purple-400 text-ink-950 font-semibold font-display hover:bg-purple-300 transition-colors"
              >
                Compare Prices for All
              </button>
            )}
          </div>
        )}

        {step === "error" && (
          <div className="text-center py-8">
            <p className="text-red-400 mb-3">
              {errorMsg || "Could not read the prescription."}
            </p>
            <button
              onClick={() => {
                setErrorMsg("");
                setStep("idle");
              }}
              className="text-purple-400 hover:text-purple-300"
            >
              Try again
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
