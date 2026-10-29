import { pochicalJsx } from "@pochical/jsx/vite";
import { tryDevPort } from "@pochical/prototype/lib/try-port";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { head } from "./head";

// Loaded with --configLoader runner (package.json): head.ts imports the
// workspace's TypeScript, which Node cannot load as it is.
export default defineConfig({
  plugins: [
    pochicalJsx(),
    { name: "pochical-try-head", transformIndexHtml: head },
    // A service worker (Workbox's, as vite-plugin-pwa writes it) that keeps
    // the build, so the app opens from the home screen without the network.
    // A new build is taken up on the next start.
    VitePWA({
      injectRegister: "script-defer",
      // The manifest is pnpm run icon:app's (public/app), linked from
      // index.html.
      manifest: false,
      registerType: "autoUpdate",
      workbox: {
        globIgnores: ["app/apple-splash-*"],
        // The app, its images and icons; iOS reads the launch images only
        // as the app is added, so they are left to the network.
        globPatterns: ["**/*.{css,html,js,png,webmanifest}"],
        // Every path that is no file draws the app (wrangler.jsonc's
        // single-page-application).
        navigateFallback: "index.html",
        // What the app reads from elsewhere, kept once read: the emoji
        // picker's data and the sample photos.
        runtimeCaching: [
          {
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "elsewhere",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200 },
            },
            urlPattern: ({ url }) =>
              url.origin === "https://cdn.jsdelivr.net" ||
              url.hostname.endsWith("picsum.photos"),
          },
        ],
      },
    }),
  ],
  // The port the links to try expect (tryUrl), so another server on it
  // stops this one rather than moving it.
  preview: { port: tryDevPort, strictPort: true },
  server: { port: tryDevPort, strictPort: true },
});
