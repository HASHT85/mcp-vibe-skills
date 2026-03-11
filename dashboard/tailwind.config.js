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
        "v-bg": "#0a0a0a",
        "v-surface": "#121212",
        "v-accent": "#D7FF2F",  // Marathon Yellow
        "v-alert": "#FF1E1E",   // Critical Red
        "v-nominal": "#00FF66", // Success Green
        "marathon-yellow": "#D7FF2F",
        "primary": "#D7FF2F",
        "secondary": "#FF6A3D",
        "background-dark": "#0B0F14",
        "ui-border": "#2A2F35",
        // Legacy aliases for existing components
        "accent": "#D7FF2F",
        "background-light": "#171D25",
        "panel": "#171D25",
        "marathon-yellow": "#D7FF2F"
      },
      fontFamily: {
        "sans": ["'Inter'", "system-ui", "sans-serif"],
        "display": ["'Space Grotesk'", "sans-serif"],
        "mono": ["'IBM Plex Mono'", "monospace"],
      },
      letterSpacing: {
        "widest": "0.3em",
        "tighter": "-0.05em",
        "tight": "-0.025em"
      },
      borderWidth: {
        '1': '1px',
        '2': '2px',
        '3': '3px',
      },
      boxShadow: {
        'neon-yellow': '0 0 10px rgba(215, 255, 47, 0.5), 0 0 20px rgba(215, 255, 47, 0.3)',
        'brutalist': '4px 4px 0px 0px #D7FF2F',
        'brutalist-alert': '4px 4px 0px 0px #FF6A3D',
        'neon-red': '0 0 10px rgba(255, 59, 59, 0.5), 0 0 20px rgba(255, 59, 59, 0.3)',
      }
    },
  },
  plugins: [],
}
