import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// satori, which draws an invitation's share image, takes no <wbr>: one
// in a box makes its text more than one child, and the drawing fails for
// every group. What it draws keeps React's own JSX, not the site's, which
// marks Japanese phrases with <wbr> (@pochical/jsx). The site's bundler reads
// the pragma only as a file's first line, so an import sorted above it
// turns it off; Bun reads it anywhere, so the files are checked as written.
const drawnBySatori = [
  "../src/components/invite-share-image.tsx",
  "../src/components/invite-mark.tsx",
];

test("keeps React's JSX, as their first line, in what satori draws", () => {
  const firstLines = drawnBySatori.map(
    (path) =>
      readFileSync(new URL(path, import.meta.url), "utf-8").split("\n")[0]
  );
  expect(firstLines).toEqual(
    drawnBySatori.map(() => "/* @jsxImportSource react */")
  );
});
