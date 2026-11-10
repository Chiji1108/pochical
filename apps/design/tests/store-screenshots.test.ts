import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  FEATURE_GRAPHIC,
  STORE_SHOTS,
  STORES,
  storeShotFile,
} from "@pochical/prototype/lib/store-shots";
import { expect, test } from "vitest";

// The stores' pictures (store/) are checked in, drawn by
// `mise run store:screenshots`: every shot of store-shots.ts has its
// picture at the size its store asks for, without the alpha channel the
// App Store refuses.
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

// Android's pictures come with its screens.
const drawn = (["ios"] as const).flatMap((id) =>
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
