import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf4e7",
          100: "#f9e4c2",
          200: "#f0c987",
          300: "#e5a94a",
          400: "#d68e22",
          500: "#b8730f",
          600: "#94590c",
          700: "#70430c",
          800: "#4a2c08",
          900: "#241605",
          950: "#120b03",
        },
        ink: "#0d0d0d",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-poppins)", "system-ui", "sans-serif"],
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        pulseSlow: "pulseSlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
