import { readFileSync } from "node:fs";
import path from "node:path";

import { characterCount } from "@pochical/design/text";
import { describe, expect, test } from "vitest";

import { unsaid } from "./store-words";

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

describe.each(texts)("$file", ({ limit, text }) => {
  test("says something within the store's limit", () => {
    expect(characterCount(text)).toBeGreaterThan(0);
    expect(characterCount(text)).toBeLessThanOrEqual(limit);
  });

  test.each(unsaid)("does not say %s", (word) => {
    expect(text).not.toContain(word);
  });
});
