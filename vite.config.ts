import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["react", "react-dom/client", "zod"] },
  build: { target: "es2022" },
  server: {
    port: 4173,
    watch: {
      ignored: [
        "**/coverage/**",
        "**/dist/**",
        "**/dist-cli/**",
        "**/playwright-report/**",
        "**/test-results/**",
      ],
    },
  },
});
