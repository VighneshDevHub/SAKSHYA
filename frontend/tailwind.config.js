/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core UI tokens (CSS-var driven for easy dual-theme support).
        // Same names as the MVP so existing components keep working.
        page: "rgb(var(--fg-page) / <alpha-value>)",
        ink: "rgb(var(--fg-ink) / <alpha-value>)",
        panel: "rgb(var(--fg-panel) / <alpha-value>)",
        field: "rgb(var(--fg-field) / <alpha-value>)",
        line: "rgb(var(--fg-line) / <alpha-value>)",
        muted: "rgb(var(--fg-muted) / <alpha-value>)",
        main: "rgb(var(--fg-main) / <alpha-value>)",
        inverse: "rgb(var(--fg-inverse) / <alpha-value>)",

        // Government palette (NTRO / NIC style — deep blue, gold, green, red).
        // These are explicit (not CSS-var derived) so that a badge or a
        // branded hero ribbon always renders in the same color regardless
        // of theme.
        govt: {
          navy: "#003366",
          blue: "#005BAC",
          blueDark: "#004491",
          blueLight: "#E4ECF6",
          gold: "#D4AF37",
          goldDark: "#B7932A",
          goldLight: "#F4E7C0",
          green: "#2E7D32",
          greenLight: "#E2EFE4",
          red: "#C62828",
          redLight: "#F9E0DE",
          ink: "#212121",
          bg: "#F5F7FA",
          panel: "#FFFFFF",
          line: "#D0D7DE",
          muted: "#5B6B7B",
        },

        amber: {
          DEFAULT: "rgb(var(--fg-amber) / <alpha-value>)",
          light: "rgb(var(--fg-amber-light) / <alpha-value>)",
        },
        teal: {
          DEFAULT: "rgb(var(--fg-teal) / <alpha-value>)",
          dim: "rgb(var(--fg-teal-dim) / <alpha-value>)",
        },
        alert: {
          DEFAULT: "rgb(var(--fg-alert) / <alpha-value>)",
          dim: "rgb(var(--fg-alert-dim) / <alpha-value>)",
        },
        typeblue: {
          DEFAULT: "rgb(var(--fg-typeblue) / <alpha-value>)",
          dim: "rgb(var(--fg-typeblue-dim) / <alpha-value>)",
        },
        typeviolet: {
          DEFAULT: "rgb(var(--fg-typeviolet) / <alpha-value>)",
          dim: "rgb(var(--fg-typeviolet-dim) / <alpha-value>)",
        },
      },
      boxShadow: {
        // Soft, government-style card elevation — subtle, not flashy.
        card: "0 1px 2px rgba(33,33,33,0.04), 0 1px 3px rgba(33,33,33,0.06)",
        "card-md": "0 2px 6px rgba(33,33,33,0.06), 0 4px 14px rgba(33,33,33,0.06)",
        focus: "0 0 0 3px rgba(0,91,172,0.18)",
      },
      fontFamily: {
        display: [
          '"Space Grotesk"', "ui-sans-serif", "system-ui",
          "-apple-system", '"Segoe UI"', "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"', "ui-monospace", '"SFMono-Regular"',
          '"Cascadia Code"', "Menlo", "Consolas", "monospace",
        ],
      },
    },
  },
  plugins: [],
};
