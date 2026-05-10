"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff } from "lucide-react";

interface Props {
  onTranscript?: (text: string) => void;
}

export function VoiceButton({ onTranscript }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const recogRef = useRef<any>(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    );
  }, []);

  const startListening = () => {
    const SR =
      (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      transcriptRef.current = "";
      setTranscript("");
      setListening(true);
    };
    recognition.onend = () => {
      setListening(false);
      const final = transcriptRef.current.trim();
      if (final && onTranscript) onTranscript(final);
    };
    recognition.onerror = () => setListening(false);
    recognition.onresult = (e: any) => {
      const t = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      transcriptRef.current = t;
      setTranscript(t);
    };

    recogRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => recogRef.current?.stop();

  if (!supported) return null;

  return (
    <div className="relative inline-flex items-center justify-center">
      <AnimatePresence>
        {listening && (
          <>
            {[1, 2, 3].map((i) => (
              <motion.span
                key={i}
                className="voice-ring absolute inset-0 rounded-full border-2 border-purple-400"
                style={{ animationDelay: `${i * 0.3}s` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={listening ? stopListening : startListening}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className={`relative z-10 p-2.5 rounded-full transition-colors ${
          listening
            ? "bg-purple-500 text-silver-100"
            : "text-text-secondary hover:text-purple-300 hover:bg-overlay-5"
        }`}
        title={
          listening
            ? `Listening: "${transcript}"`
            : "Voice search (English / Hindi)"
        }
        aria-label="Voice search"
      >
        {listening ? <MicOff size={18} /> : <Mic size={18} />}
      </motion.button>
    </div>
  );
}
