import { defineConfig } from "vite";
import { raidCapturePlugin } from "./server/site-ingest/plugin.js";

export default defineConfig({
  base: "./",
  plugins: [raidCapturePlugin()],
  build: { target: "es2022" },
  server: {
    port: 5178,
    strictPort: true,
    proxy: { "/api/arena": "http://127.0.0.1:5180" },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { "/api/arena": "http://127.0.0.1:5180" },
  },
});
