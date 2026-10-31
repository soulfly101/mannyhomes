import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In docker compose the API is the `backend` service; outside Docker it's on localhost.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8000";
// File-change events don't cross into Docker on every setup (e.g. Colima), so poll there.
const poll = process.env.VITE_POLL === "true";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: poll ? { usePolling: true, interval: 300 } : undefined,
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
});
