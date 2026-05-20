import type { Config } from "tailwindcss";

// PATTERN: Asymmetric Editorial Split — token values must match globals.css :root
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:     "#0c1a2c",
        surface: "#f7f8fa",
        raised:  "#ffffff",
        accent:  "#1f4ed8",
        muted:   "#6b7585",
        hairline:"#e3e6ec",
      },
      fontFamily: {
        display: ["Inter Tight", "sans-serif"],
        body:    ["Inter", "sans-serif"],
        mono:    ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        pattern: "8px",
      },
      maxWidth: {
        content: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
