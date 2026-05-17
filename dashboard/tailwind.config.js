/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── VEIST Core Identity ──
        "v-bg": "#0B0F14",
        "v-surface": "#11161D",
        "v-accent": "#D7FF2F",
        "v-alert": "#FF6A3D",
        "v-nominal": "#22C55E",

        // ── Surfaces (DeerFlow-inspired warm dark tones) ──
        "surface-0": "#0B0F14",      // Deepest background
        "surface-1": "#0F1319",      // Main background
        "surface-2": "#13171E",      // Sidebar background
        "surface-3": "#181D25",      // Elevated cards
        "surface-4": "#1E2430",      // Input fields, hover states
        "surface-5": "#252C3A",      // Active/selected items
        "surface-6": "#2E3647",      // Borders, dividers

        // ── Text ──
        "text-primary": "#E8EAF0",
        "text-secondary": "#8B93A6",
        "text-tertiary": "#5A6178",
        "text-muted": "#3D4557",

        // ── Accent variants ──
        "accent": "#D7FF2F",
        "accent-dim": "#B1D500",
        "accent-muted": "rgba(215, 255, 47, 0.15)",
        "accent-subtle": "rgba(215, 255, 47, 0.08)",

        // ── Status ──
        "status-success": "#22C55E",
        "status-warning": "#F59E0B",
        "status-error": "#EF4444",
        "status-info": "#3B82F6",

        // ── Legacy aliases (keep for gradual migration) ──
        "background": "#0B0F14",
        "primary": "#D7FF2F",
        "secondary": "#FF6A3D",
        "on-surface": "#E8EAF0",
        "border-subtle": "#252C3A",
        "border-muted": "#1E2430",
      },
      fontFamily: {
        "headline": ["'Space Grotesk'", "sans-serif"],
        "body": ["'Inter'", "system-ui", "sans-serif"],
        "sans": ["'Inter'", "system-ui", "sans-serif"],
        "display": ["'Space Grotesk'", "sans-serif"],
        "mono": ["'IBM Plex Mono'", "monospace"],
        "label": ["'IBM Plex Mono'", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],  // 10px
      },
      letterSpacing: {
        "widest": "0.2em",
        "tighter": "-0.05em",
        "tight": "-0.025em"
      },
      borderRadius: {
        DEFAULT: "8px",
        "sm": "6px",
        "md": "10px",
        "lg": "14px",
        "xl": "18px",
        "2xl": "24px",
        "pill": "9999px",
      },
      boxShadow: {
        "glow-sm": "0 0 8px rgba(215, 255, 47, 0.15)",
        "glow-md": "0 0 16px rgba(215, 255, 47, 0.2)",
        "glow-lg": "0 0 24px rgba(215, 255, 47, 0.25), 0 0 48px rgba(215, 255, 47, 0.1)",
        "elevated": "0 4px 24px rgba(0, 0, 0, 0.4), 0 1px 4px rgba(0, 0, 0, 0.2)",
        "card": "0 2px 12px rgba(0, 0, 0, 0.3)",
        "input-focus": "0 0 0 2px rgba(215, 255, 47, 0.2), 0 0 16px rgba(215, 255, 47, 0.1)",
        "float": "0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "dot-pulse": "dotPulse 1.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        dotPulse: {
          "0%, 80%, 100%": { opacity: "0.3", transform: "scale(0.8)" },
          "40%": { opacity: "1", transform: "scale(1)" },
        },
      },
      transitionDuration: {
        "250": "250ms",
      },
      backdropBlur: {
        "xs": "2px",
      },
    },
  },
  plugins: [],
}
