import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        brand: "#2563EB",
        positive: "#15803D",
        critical: "#B91C1C",
        attention: "#B45309"
      },
      boxShadow: { surface: "0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.1)" }
    }
  },
  plugins: []
} satisfies Config;
