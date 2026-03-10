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
        "primary": "#ff3b3b", // Marathon Red Accent
        "accent": "#d4ff00", // Marathon/Cyberpunk Toxic Yellow
        "background-light": "#1a1a1a", // Darker default
        "background-dark": "#050505", // Almost black
        "panel": "#0f0f0f", // Very dark grey for panels
        "border-muted": "#333333", // Crisp borders
        "marathon-yellow": "#facc15" // A slightly more golden yellow for warnings
      },
      fontFamily: {
        "display": ["'IBM Plex Mono'", "Courier New", "monospace"], // More robotic/terminal feel
        "mono": ["'Fira Code'", "Courier New", "Courier", "monospace"]
      },
      letterSpacing: {
        "widest": "0.3em", // Exaggerated terminal tracking
        "tighter": "-0.05em",
        "tight": "-0.025em"
      },
      boxShadow: {
        'neon-yellow': '0 0 10px rgba(212, 255, 0, 0.5), 0 0 20px rgba(212, 255, 0, 0.3)',
        'neon-red': '0 0 10px rgba(255, 59, 59, 0.5), 0 0 20px rgba(255, 59, 59, 0.3)',
      }
    },
  },
  plugins: [],
}
