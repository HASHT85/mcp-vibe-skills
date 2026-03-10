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
        "primary": "#ec5b13",
        "accent": "#d4ff00",
        "background-light": "#f8f6f6",
        "background-dark": "#0f0a08",
        "panel": "#1a1310",
        "border-muted": "#2d1e18"
      },
      fontFamily: {
        "display": ["Public Sans", "sans-serif"],
        "mono": ["Courier New", "Courier", "monospace"]
      },
      letterSpacing: {
        "widest": "0.2em",
        "tighter": "-0.05em",
        "tight": "-0.025em"
      }
    },
  },
  plugins: [],
}
