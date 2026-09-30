import { expect, test } from "bun:test";

import { phosphorNames } from "../scripts/mark-icons";
import { readPhosphorPaths } from "../scripts/phosphor-paths";
import { markIconPaths } from "../src/lib/mark-icon-paths";

// The written paths are Phosphor's current ones, for every icon the marks
// use; if not, run bun run icon:marks.
test("mark icon paths match the installed Phosphor", async () => {
  expect(Object.keys(markIconPaths)).toEqual([...phosphorNames]);
  for (const name of phosphorNames) {
    expect(markIconPaths[name]).toEqual(await readPhosphorPaths(name));
  }
});
