// sRGB hex ⇄ OKLCH, for deriving palette colors that keep perceived
// lightness while changing hue. Formulas from https://bottosson.github.io/posts/oklab/.

export type Oklch = { lightness: number; chroma: number; hue: number };

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

export function hexToOklch(hex: string): Oklch {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    toLinear(Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  );
  const long = Math.cbrt(
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
  );
  const medium = Math.cbrt(
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
  );
  const short = Math.cbrt(
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
  );
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const b = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return {
    chroma: Math.hypot(a, b),
    hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
    lightness:
      0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
  };
}

function oklchToLinear({ lightness, chroma, hue }: Oklch) {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

const GAMUT_EPSILON = 0.0001;
const CHROMA_STEP = 0.002;

// Converts to #rrggbb, lowering chroma until the color fits in sRGB.
export function oklchToHex(color: Oklch): string {
  let { chroma } = color;
  let channels = oklchToLinear({ ...color, chroma });
  while (
    chroma > 0 &&
    channels.some(
      (channel) => channel < -GAMUT_EPSILON || channel > 1 + GAMUT_EPSILON
    )
  ) {
    chroma = Math.max(0, chroma - CHROMA_STEP);
    channels = oklchToLinear({ ...color, chroma });
  }
  return `#${channels
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(channel))) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}
