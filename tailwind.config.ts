import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        scubus: {
          navy: "#400C4D",
          blue: "#75507E",
          accent: "#ff8c00",
        },
      },
    },
  },
  plugins: [],
};
export default config;
