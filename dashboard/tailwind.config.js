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
        // ── VEIST Core Palette ──
        "v-bg": "#0B0F14",
        "v-surface": "#11161D",
        "v-accent": "#D7FF2F",
        "v-alert": "#FF6A3D",
        "v-nominal": "#22C55E",

        // ── Stitch M3 Surface System ──
        "background": "#0B0F14",
        "surface": "#101419",
        "surface-dim": "#101419",
        "surface-container-lowest": "#0a0e13",
        "surface-container-low": "#181c21",
        "surface-container": "#1c2025",
        "surface-container-high": "#262a30",
        "surface-container-highest": "#31353b",
        "surface-bright": "#36393f",
        "surface-variant": "#31353b",

        // ── On-Surface ──
        "on-surface": "#e0e2ea",
        "on-surface-variant": "#c5c9ad",
        "on-background": "#e0e2ea",

        // ── Primary / Accent ──
        "primary": "#ffffff",
        "primary-fixed": "#cbf21d",
        "primary-fixed-dim": "#b1d500",
        "primary-container": "#cbf21d",
        "on-primary": "#2a3400",
        "on-primary-fixed": "#171e00",
        "on-primary-container": "#596c00",

        // ── Secondary (Orange) ──
        "secondary": "#FF6A3D",
        "secondary-container": "#ab2f01",
        "on-secondary": "#5f1500",
        "on-secondary-container": "#ffc8b9",

        // ── Borders ──
        "outline": "#8f9379",
        "outline-variant": "#454933",
        "border-subtle": "#2A3442",

        // ── Error ──
        "error": "#ffb4ab",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",

        // ── Legacy aliases ──
        "accent": "#D7FF2F",
        "background-light": "#171D25",
        "background-dark": "#0B0F14",
        "panel": "#1c2025",
        "border-muted": "#2A3442",
        "marathon-yellow": "#D7FF2F"
      },
      fontFamily: {
        "headline": ["'Space Grotesk'", "sans-serif"],
        "body": ["'Inter'", "system-ui", "sans-serif"],
        "sans": ["'Inter'", "system-ui", "sans-serif"],
        "display": ["'Space Grotesk'", "sans-serif"],
        "mono": ["'IBM Plex Mono'", "monospace"],
        "label": ["'IBM Plex Mono'", "monospace"],
      },
      letterSpacing: {
        "widest": "0.2em",
        "tighter": "-0.05em",
        "tight": "-0.025em"
      },
      borderWidth: {
        '1': '1px',
        '2': '2px',
        '3': '3px',
      },
      borderRadius: {
        DEFAULT: "0px",
        lg: "0px",
        xl: "0px",
      },
      boxShadow: {
        'neon-yellow': '0 0 10px rgba(215, 255, 47, 0.3), 0 0 20px rgba(215, 255, 47, 0.15)',
        'neon-glow': '0 0 15px rgba(215, 255, 47, 0.3)',
        'brutalist': '4px 4px 0px 0px #D7FF2F',
        'brutalist-alert': '4px 4px 0px 0px #FF6A3D',
        'neon-red': '0 0 10px rgba(255, 59, 59, 0.5), 0 0 20px rgba(255, 59, 59, 0.3)',
      }
    },
  },
  plugins: [],
}
