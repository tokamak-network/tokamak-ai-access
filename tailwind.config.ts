import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#e3342f",   // Tokamak red — adjust to official brand color
          50:  "#fef2f2",
          900: "#7f1d1d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
