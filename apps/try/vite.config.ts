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
    // the build, so the app opens from the home screen without the network
    // (spec/try.md).
    // A new build waits until no page of the old one is open ("prompt",
    // with nothing to prompt), so an open page never loses the chunks it
    // has yet to load.
    VitePWA({
      injectRegister: "script-defer",
      // The manifest is pnpm run icon:app's (public/app), linked from
      // index.html.
      manifest: false,
      registerType: "prompt",
      workbox: {
        globIgnores: ["app/apple-splash-*", "app/screenshot-*"],
        // The app, its images and icons. iOS reads the launch images only
        // as the app is added, and a browser shows the manifest's
        // screenshots only as it offers to install the app, so both are
        // left to the network.
        globPatterns: ["**/*.{css,html,js,png,webmanifest}"],
        // Above the largest file (the app's script, about 1.5 MB), which
        // Workbox would otherwise leave out with only a warning.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Every path that is no file draws the app (wrangler.jsonc's
        // single-page-application); one whose last part has a dot is taken
        // for a file and goes to it. Workbox tests the path with its query,
        // which this leaves aside.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^[^?]*\/[^/?]+\.[^/?]+(?:\?.*)?$/u],
      },
    }),
  ],
  // The port the links to try expect (tryUrl), so another server on it
  // stops this one rather than moving it.
  preview: { port: tryDevPort, strictPort: true },
  server: { port: tryDevPort, strictPort: true },
});
