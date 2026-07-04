import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // GatherArc palette — midnight navy, warm gold, soft ivory.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // Centralized GatherArc brand tokens (semantic; backed by CSS vars).
        brand: {
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          surface: "var(--brand-surface)",
          background: "var(--brand-background)",
          text: "var(--brand-text)",
          muted: "var(--brand-muted)",
          border: "var(--brand-border)",
        },
        ivory: {
          DEFAULT: "#F7F3EA",
          dark: "#F0EADB",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Warm gold — GatherArc accent. (`gold` class names retained across the
        // app; only the values move to the brand palette to re-theme globally.)
        gold: {
          DEFAULT: "#C28A3D",
          light: "#D6A85F",
          dark: "#9A6B2C",
        },
        // Midnight navy — GatherArc primary foundation. (`royal` class names are
        // retained app-wide; the values now hold navy so the whole UI re-themes.)
        royal: {
          DEFAULT: "#142033",
          light: "#26374F",
          dark: "#0D1520",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
