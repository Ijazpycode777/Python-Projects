import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration for SmartCampus 360.
// In development, the dev server proxies /api and /socket.io to the Express backend on port 4000.
// In production, Express serves the built dist/ assets and the same routes are handled in-process.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/socket.io": { target: "http://localhost:4000", changeOrigin: true, ws: true },
      "/uploads": { target: "http://localhost:4000", changeOrigin: true }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1600
  }
});
