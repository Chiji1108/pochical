// Writes the Phosphor icons that shift marks use, in the two weights they
// are drawn in (duotone when filled, regular when not), as plain path data.
// @phosphor-icons/react ships all six weights in every icon, which would
// put the four unused ones in every page that shows a calendar.
// Run again after adding an icon to markIconGlyphs (src/mark-icons.ts):
// bun run --cwd design icon:marks
import { writeFile } from "node:fs/promises";

import { markIconGlyphs } from "../src/mark-icons";
import { markIconWeights, readPhosphorPaths } from "./phosphor-paths";

// Phosphor's names for the glyphs the marks draw, each once.
export const phosphorNames = [
  ...new Set(
    Object.values(markIconGlyphs).filter((name) => name !== undefined)
  ),
].toSorted();

const OUTPUT = new URL("../src/mark-icon-paths.ts", import.meta.url).pathname;

if (import.meta.main) {
  const entries = await Promise.all(
    phosphorNames.map(
      async (name) =>
        `  ${name}: ${JSON.stringify(await readPhosphorPaths(name))},`
    )
  );
  await writeFile(
    OUTPUT,
    [
      "// Written by scripts/mark-icons.ts (bun run --cwd design icon:marks); do not edit.",
      `// Phosphor's paths for the shift marks' icons, ${markIconWeights.join(" and ")}, on a 256 grid.`,
      "type MarkIconPath = { d: string; opacity?: number };",
      `export type MarkIconName = ${phosphorNames.map((name) => `"${name}"`).join(" | ")};`,
      "",
      `export const markIconPaths: Record<MarkIconName, Record<"${markIconWeights.join('" | "')}", MarkIconPath[]>> = {`,
      ...entries,
      "};",
      "",
    ].join("\n")
  );
}
