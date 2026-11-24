/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The app is served from https://anschae.github.io/fretlab/ — every absolute
// URL (assets, service-worker scope, manifest start_url) must live under BASE.
const BASE = "/fretlab/";

export default defineConfig({
  base: BASE,
  build: {
    target: "es2022",
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
  plugins: [
    VitePWA({
      registerType: "prompt", // we show our own "new version — reload" notice
      injectRegister: false, // registered manually in src/pwa.ts
      scope: BASE,
      base: BASE,
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "Fretlab — ear & fretboard trainer",
        short_name: "Fretlab",
        description: "Interval, fretboard and chord trainer for 6-, 7- and 8-string guitars.",
        lang: "en",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        orientation: "any",
        background_color: "#15120f",
        theme_color: "#15120f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the whole build so every module works offline.
        globPatterns: ["**/*.{js,css,html,svg,png,json,woff2,webmanifest}"],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
