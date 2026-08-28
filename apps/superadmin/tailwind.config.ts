import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ── EduCore Super Admin palette (SA-02) ──
        // The shadcn tokens above are wired to these same values in
        // globals.css, so primitives inherit the theme; use sa-* directly
        // when a component needs a specific layer or hue.
        sa: {
          base: "#0A1628",
          surface: "#1E293B",
          raised: "#293548",
          overlay: "#334155",
          border: "#1E3A5F",
          "border-em": "#3B6090",
          blue: "#3B82F6",
          teal: "#14B8A6",
          green: "#22C55E",
          amber: "#F59E0B",
          red: "#EF4444",
          purple: "#8B5CF6",
          text: "#F8FAFC",
          muted: "#94A3B8",
          dim: "#64748B",
          disabled: "#475569",
        },
        // Categorical hues for plan mix — validated for colour-blind
        // separation and 3:1 contrast against sa-surface. Do not substitute.
        plan: {
          starter: "#3B82F6",
          growth: "#D97706",
          professional: "#8B5CF6",
          enterprise: "#0D9488",
          government: "#E11D48",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Console-density ramp from the design system.
        caption: ["11px", { lineHeight: "16px" }],
        body: ["13px", { lineHeight: "20px" }],
        h3: ["15px", { lineHeight: "22px", fontWeight: "600" }],
        h2: ["18px", { lineHeight: "26px", fontWeight: "600" }],
        h1: ["24px", { lineHeight: "30px", fontWeight: "700", letterSpacing: "-0.02em" }],
        metric: ["28px", { lineHeight: "34px", fontWeight: "700", letterSpacing: "-0.01em" }],
      },
      spacing: {
        sidebar: "220px",
        topbar: "56px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
