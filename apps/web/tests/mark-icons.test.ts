import { markIconPaths } from "@pochical/design/mark-icon-paths";
import { expect, test } from "vitest";

import { phosphorNames } from "../../../design/scripts/mark-icons";
import { readPhosphorPaths } from "../../../design/scripts/phosphor-paths";

// The written paths are Phosphor's current ones, for every icon the marks
// use; if not, run pnpm --dir design icon:marks.
test("mark icon paths match the installed Phosphor", async () => {
  expect(Object.keys(markIconPaths)).toEqual([...phosphorNames]);
  for (const name of phosphorNames) {
    expect(markIconPaths[name]).toEqual(await readPhosphorPaths(name));
  }
});
