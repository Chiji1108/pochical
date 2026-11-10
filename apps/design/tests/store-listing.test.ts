import { readFileSync } from "node:fs";
import path from "node:path";

import { characterCount } from "@pochical/design/text";
import { describe, expect, test } from "vitest";

// The stores' listings (store/README.md), each text within the store's
// limit, counted as a reader counts, and keeping to the words the listing
// may say.
const folder = path.join(import.meta.dirname, "../../../store/ja");
const texts = [
  { file: "app-store/name.txt", limit: 30 },
  { file: "app-store/subtitle.txt", limit: 30 },
  { file: "app-store/promotional_text.txt", limit: 170 },
  { file: "app-store/keywords.txt", limit: 100 },
  { file: "google-play/title.txt", limit: 30 },
  { file: "google-play/short_description.txt", limit: 80 },
  { file: "description.txt", limit: 4000 },
].map(({ file, limit }) => ({
  file,
  limit,
  text: readFileSync(path.join(folder, file), "utf-8").trimEnd(),
}));

// A price or a rank, which both stores turn down; a promise of safety,
// which the app does not make; and words that would say the phone's
// calendar is kept both ways.
const unsaid = ["無料", "No.1", "人気", "安全", "保存しない", "同期", "連携"];

describe.each(texts)("$file", ({ limit, text }) => {
  test("says something within the store's limit", () => {
    expect(characterCount(text)).toBeGreaterThan(0);
    expect(characterCount(text)).toBeLessThanOrEqual(limit);
  });

  test.each(unsaid)("does not say %s", (word) => {
    expect(text).not.toContain(word);
  });
});
