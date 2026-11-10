import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  FEATURE_GRAPHIC,
  HEADLINE_SHARE,
  STORE_SHOTS,
  STORES,
  storeShotFile,
} from "@pochical/prototype/lib/store-shots";
import { expect, test } from "vitest";

// The stores' pictures (store/) are checked in, drawn by
// `mise run store:screenshots`: every shot of store-shots.ts has its
// picture for each store at the size it asks for, without the alpha
// channel the App Store refuses.
const store = path.join(import.meta.dirname, "../../../store");

// A PNG's size and whether it has an alpha channel, from its IHDR chunk,
// the file's first.
const header = (file: string) => {
  const bytes = readFileSync(file);
  const colorType = bytes.readUInt8(25);
  return {
    alpha: colorType === 4 || colorType === 6,
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
};

const drawn = (["ios", "android"] as const).flatMap((id) =>
  STORE_SHOTS.map((shot) => ({
    file: path.join("screenshots", id, storeShotFile(shot.name)),
    size: STORES[id],
  }))
);

test.each([
  ...drawn,
  { file: `${FEATURE_GRAPHIC.name}.png`, size: FEATURE_GRAPHIC },
])("$file is drawn at its store's size", ({ file, size }) => {
  const full = path.join(store, file);
  expect(existsSync(full), `${file}: run mise run store:screenshots`).toBe(
    true
  );
  expect(header(full)).toEqual({
    alpha: false,
    height: size.height,
    width: size.width,
  });
});

// Google Play's own asks of a screenshot, kept by the App Store's too:
// https://support.google.com/googleplay/android-developer/answer/9866151
test("the first three shots show the app, under a headline of a fifth at most", () => {
  expect(STORE_SHOTS.slice(0, 3).map((shot) => shot.kind)).toEqual([
    "screen",
    "screen",
    "screen",
  ]);
  expect(HEADLINE_SHARE).toBeLessThanOrEqual(0.2);
});
