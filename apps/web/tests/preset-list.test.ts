import { expect, test } from "bun:test";

import { presetList } from "../src/lib/design-patterns";

// A ready-made pattern's next day comes with it only when that pattern
// does, as iOS's Pattern(_:keeping:) has it (spec/shift-patterns.md).
test("a ready-made pattern keeps its next day only when that comes too", () => {
  const [withOffDuty] = presetList(["duty", "offDuty", "off"]);
  expect(withOffDuty?.nextDay).toBe("offDuty");
  const [alone] = presetList(["duty", "off"]);
  expect(alone?.nextDay).toBeUndefined();
  const [already] = presetList(["night"], new Set(["after", "night"]));
  expect(already?.nextDay).toBe("after");
});
