import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["f1-logo.png"],
      manifest: {
        name: "F1 SIM — Race Control",
        short_name: "F1 SIM",
        description: "A local-first Formula season and dynasty simulator.",
        theme_color: "#111820",
        background_color: "#f0f1f2",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/f1-logo.png", sizes: "any", type: "image/png", purpose: "any" }],
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:4173" },
  },
});
