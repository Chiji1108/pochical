import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

// A PNG's size and whether it has an alpha channel, from its IHDR chunk,
// the file's first.
export const pngHeader = (file: string) => {
  const bytes = readFileSync(file);
  const colorType = bytes.readUInt8(25);
  return {
    alpha: colorType === 4 || colorType === 6,
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
};

// The color of a PNG's first pixel, as six hex digits, for one of 8-bit
// RGB or RGBA: the first row's first pixel has none before or over it, so
// whatever filter the row is written with leaves its bytes as they are.
export const pngFirstPixel = (file: string): string => {
  const bytes = readFileSync(file);
  const data: Buffer[] = [];
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString("latin1", at + 4, at + 8) === "IDAT") {
      data.push(bytes.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }
  return inflateSync(Buffer.concat(data)).subarray(1, 4).toString("hex");
};
