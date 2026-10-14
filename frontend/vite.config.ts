import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    host: "0.0.0.0",
    proxy: {
      "/api/v1": {
        target: process.env.BACKEND_UPSTREAM || "http://api:3000",
        changeOrigin: false,
      },
    },
  },
  build: { sourcemap: false },
});
