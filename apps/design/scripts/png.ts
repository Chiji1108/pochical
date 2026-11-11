import sharp from "sharp";

// A PNG's size and whether it has an alpha channel.
export const pngHeader = async (file: string) => {
  const { hasAlpha, height, width } = await sharp(file).metadata();
  return { alpha: hasAlpha, height, width };
};

// The color of a PNG's first pixel, as six hex digits.
export const pngFirstPixel = async (file: string): Promise<string> => {
  const pixel = await sharp(file)
    .extract({ height: 1, left: 0, top: 0, width: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  return pixel.subarray(0, 3).toString("hex");
};
