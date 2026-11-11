import { readFileSync } from "node:fs";

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
