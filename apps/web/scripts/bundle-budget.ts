// Checks how much JavaScript each page waits for before it first shows:
// the scripts it loads up front (the site's own and the page's), gzipped.
// A page over its budget fails CI. The usual cause is one import that pulls
// the app's screens into a page's own file, as /try's head once did for
// every page, and the top page's words would again wait for its phones.
// Run after bun run build: bun run bundle:budget
import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// KB, gzipped. The site's own share (React and the router) is about 120.
const budgets: Record<string, number> = {
  // Its words; the phones and the sky load after (lp-screens.tsx).
  "/": 150,
  "/privacy": 140,
  "/support": 140,
  "/terms": 140,
  // The app itself, which grows with it; raised from 450 as the widgets'
  // settings came in (2026-10).
  "/try": 470,
};

const DIST = new URL("../dist/", import.meta.url).pathname;
const KB = 1024;

const serverAssets = `${DIST}server/assets/`;
const serverFiles: string[] = await readdir(serverAssets);
const manifestFile = serverFiles.find((name) =>
  name.startsWith("_tanstack-start-manifest")
);
if (manifestFile === undefined) {
  throw new Error("No build found; run bun run build first");
}
const { tsrStartManifest } = (await import(
  `${serverAssets}${manifestFile}`
)) as {
  tsrStartManifest: () => {
    routes: Record<string, { preloads?: string[] } | undefined>;
  };
};
const { routes } = tsrStartManifest();

async function gzippedSize(path: string) {
  const zipped: Uint8Array = gzipSync(await readFile(`${DIST}client${path}`), {
    level: 9,
  });
  return zipped.length;
}

let over = false;
for (const [route, budget] of Object.entries(budgets)) {
  if (routes[route] === undefined) {
    throw new Error(`No route ${route} in the build`);
  }
  const scripts = new Set([
    ...(routes.__root__?.preloads ?? []),
    ...(routes[route].preloads ?? []),
  ]);
  const sizes: number[] = await Promise.all([...scripts].map(gzippedSize));
  const size = sizes.reduce((sum, each) => sum + each, 0) / KB;
  const fits = size <= budget;
  over ||= !fits;
  console.log(
    `${fits ? "ok  " : "OVER"} ${route.padEnd(10)} ${size.toFixed(0).padStart(4)} KB of ${budget} KB`
  );
}
if (over) {
  throw new Error("A page loads more than its budget before it shows");
}
