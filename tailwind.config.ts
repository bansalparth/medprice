import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
      colors: {
        silver: {
          100: "var(--silver-100)",
          200: "var(--silver-200)",
          300: "var(--silver-300)",
          400: "var(--silver-400)",
        },
        purple: {
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          900: "#2e1065",
        },
        ink: {
          950: "#06040d",
          900: "#0c0719",
          800: "#120c25",
          700: "#1a1233",
        },
        accent: {
          green: "#10b981",
          red: "#f87171",
        },
      },
      animation: {
        "blob-drift": "blob-drift 10s ease-in-out infinite",
        shimmer: "shimmer 1.5s infinite",
        "fade-up": "fadeUp 0.5s ease forwards",
        "scale-in": "scaleIn 0.3s ease forwards",
        float: "float 4s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
