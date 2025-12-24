import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Adobe-inspired palette
        adobe: {
          red: "#FA0F00",
          blue: "#1473E6",
          purple: "#7C4DFF",
          dark: "#1D1D1D",
          gray: {
            50: "#F8F8F8",
            100: "#EFEFEF",
            200: "#DFDFDF",
            300: "#BCBCBC",
            400: "#959595",
            500: "#6E6E6E",
            600: "#4B4B4B",
            700: "#323232",
            800: "#1D1D1D",
            900: "#0F0F0F",
          },
        },
        // Inspiration theme colors
        inspiration: {
          ideas: "#10B981", // Emerald for ideas
          insights: "#8B5CF6", // Purple for insights
          accent: "#F59E0B", // Amber accent
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "gradient": "gradient 8s ease infinite",
      },
      keyframes: {
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

