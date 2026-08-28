import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        scubus: {
          navy: "#0b2545",
          blue: "#134074",
          accent: "#ff8c00",
        },
      },
    },
  },
  plugins: [],
};
export default config;
