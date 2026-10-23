// The app to try (apps/try), a Worker on its own origin, where the site
// (apps/web) and the design documents (apps/design) send a visitor: its dev
// server (mise run try) from a dev server, try.pochical.app from every
// build, previews included.
export const tryUrl = import.meta.env.DEV
  ? "http://localhost:3202/"
  : "https://try.pochical.app/";
