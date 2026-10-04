// Checks how much JavaScript each page waits for before it first shows:
// the scripts it loads up front (the site's own and the page's) and every
// chunk those import in turn, gzipped. The manifest lists only some of the
// shared chunks, and which ones it leaves out moves with how the code is
// split: moving code between files (2026-10) swung /try's listed size from
// 423 to 403 to 430 KB while what it waited for stayed about 483.
// A page over its budget fails CI. The usual cause is one import that pulls
// the app's screens into a page's own file, as /try's head once did for
// every page, and the top page's words would again wait for its phones.
// Run after bun run build: bun run bundle:budget
import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// KB, gzipped. The site's own share (React, the router and BudouX's
// Japanese phrases, src/jsx) is about 130.
const budgets: Record<string, number> = {
  // Its words; the phones and the sky load after (lp-screens.tsx).
  "/": 150,
  "/privacy": 140,
  "/support": 140,
  "/terms": 140,
  // /try has none. It is the app itself, a prototype nothing links to, and
  // its budget was only ever raised as the app grew (450, 470, 475); counted
  // with its imports it was 484 (2026-10). The top page's phones run the
  // same app, but after its words, so its budget above is what people see.
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

// A chunk's static imports as the build writes them, `import{a}from"./x.js"`
// and `import"./x.js"`, which the browser fetches before the chunk runs.
// `import("./x.js")` loads later, and its parenthesis keeps it out.
const STATIC_IMPORT =
  /(?:^|[;\n])\s*import\s*(?:[\w$\s{},*]+from\s*)?"(?<specifier>\.{1,2}\/[^"]+\.js)"/gu;

async function importsOf(path: string) {
  if (!path.endsWith(".js")) {
    return [];
  }
  const code: string = await readFile(`${DIST}client${path}`, "utf-8");
  const chunk = new URL(path, "file:");
  const imports: string[] = [];
  for (const { groups } of code.matchAll(STATIC_IMPORT)) {
    if (groups?.specifier !== undefined) {
      imports.push(new URL(groups.specifier, chunk).pathname);
    }
  }
  return imports;
}

async function withImports(listed: Iterable<string>) {
  const found = new Set(listed);
  let next = [...found];
  while (next.length > 0) {
    const imports = await Promise.all(next.map(importsOf));
    next = [...new Set(imports.flat())].filter((path) => !found.has(path));
    for (const path of next) {
      found.add(path);
    }
  }
  return found;
}

async function gzippedSize(path: string) {
  const zipped: Uint8Array = gzipSync(await readFile(`${DIST}client${path}`), {
    level: 9,
  });
  return zipped.length;
}

async function totalSize(paths: Iterable<string>) {
  const sizes = await Promise.all([...paths].map(gzippedSize));
  return sizes.reduce((sum, each) => sum + each, 0) / KB;
}

let over = false;
for (const [route, budget] of Object.entries(budgets)) {
  if (routes[route] === undefined) {
    throw new Error(`No route ${route} in the build`);
  }
  const listed = new Set([
    ...(routes.__root__?.preloads ?? []),
    ...(routes[route].preloads ?? []),
  ]);
  const [size, listedSize] = await Promise.all([
    withImports(listed).then(totalSize),
    totalSize(listed),
  ]);
  const fits = size <= budget;
  over ||= !fits;
  console.log(
    `${fits ? "ok  " : "OVER"} ${route.padEnd(10)} ${size.toFixed(0).padStart(4)} KB of ${budget} KB (the manifest lists ${listedSize.toFixed(0)})`
  );
}
if (over) {
  throw new Error("A page loads more than its budget before it shows");
}
