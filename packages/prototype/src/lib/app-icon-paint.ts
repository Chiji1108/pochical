// The app icon from the poodle drawing: black lines on white. The outside
// of the dog is found by flooding in from the edges, so the ground can take
// a color while the dog stays white.

export type IconColors = {
  id: string;
  name: string;
  ground: string;
  dog: string;
  line: string;
  // A band of the dog's color around the whole drawing, in source pixels,
  // for grounds as dark as the lines.
  rim?: number;
};

export const iconColorOptions: IconColors[] = [
  {
    dog: "#ffffff",
    ground: "#486444",
    id: "moss",
    line: "#1d261b",
    name: "モス",
  },
  {
    dog: "#fffdf8",
    ground: "#efe4cf",
    id: "paper",
    line: "#2b2823",
    name: "紙",
  },
  {
    dog: "#ffffff",
    ground: "#ffffff",
    id: "white",
    line: "#252823",
    name: "白",
  },
  // A dark ground and a light dog. The lines stay dark on a light rim, so
  // the nose, which sits outside the outline, still shows.
  {
    dog: "#ece8df",
    ground: "#1f231e",
    id: "dark",
    line: "#1f231e",
    name: "ダーク",
    rim: 17,
  },
];

// What iOS shows on a home screen set to dark icons: each icon darkened
// but still itself, so choosing モス never turns into a black icon.
export const darkTwins: IconColors[] = [
  {
    dog: "#ece8df",
    ground: "#2b3a29",
    id: "moss-dark",
    line: "#1a2219",
    name: "モス（暗い見た目）",
    rim: 17,
  },
  {
    dog: "#efe6d6",
    ground: "#3a342b",
    id: "paper-dark",
    line: "#201c17",
    name: "紙（暗い見た目）",
    rim: 17,
  },
];

// The dark-home-screen version of each pickable icon. White has no dark
// of its own, so it borrows ダーク, which is already dark.
export const darkTwinOf: Record<string, string> = {
  dark: "dark",
  moss: "moss-dark",
  paper: "paper-dark",
  white: "dark",
};

export const ICON_SIZE = 1024;
// Share of the icon's width the drawing's lines take, leaving room for the
// rounded corners the system cuts.
export const DRAWING_SHARE = 0.74;
// Brighter than this counts as paper when finding the outside.
const PAPER_LIGHTNESS = 128;
// Darker than this counts as a line when measuring the drawing's bounds.
const INK_LIGHTNESS = 100;

type Rgb = [number, number, number];

export function rgbOf(hex: string): Rgb {
  const channel = (start: number) =>
    Number.parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

// Marks every paper pixel reachable from the image's edges.
export function outsideOf(
  lightness: Uint8Array,
  width: number,
  height: number
) {
  const outside = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (index: number) => {
    if (outside[index] === 0 && (lightness[index] ?? 0) > PAPER_LIGHTNESS) {
      outside[index] = 1;
      stack.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length > 0) {
    const index = stack.pop() ?? 0;
    const x = index % width;
    if (x > 0) {
      push(index - 1);
    }
    if (x < width - 1) {
      push(index + 1);
    }
    if (index >= width) {
      push(index - width);
    }
    if (index < width * (height - 1)) {
      push(index + width);
    }
  }
  return outside;
}

// Chamfer steps: 3 across, 4 diagonally, about 3 per pixel.
const STRAIGHT = 3;
const DIAGONAL = 4;

// Each outside pixel's distance in pixels to the drawing (lines and the
// dog inside them), by a two-pass chamfer transform.
export function distanceToDrawing(
  outside: Uint8Array,
  width: number,
  height: number
) {
  const far = 1_000_000;
  const distance = new Float32Array(width * height);
  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = outside[index] ? far : 0;
  }
  const relax = (index: number, from: number, step: number) => {
    const through = (distance[from] ?? far) + step;
    if (through < (distance[index] ?? far)) {
      distance[index] = through;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x > 0) {
        relax(index, index - 1, STRAIGHT);
      }
      if (y > 0) {
        relax(index, index - width, STRAIGHT);
        if (x > 0) {
          relax(index, index - width - 1, DIAGONAL);
        }
        if (x < width - 1) {
          relax(index, index - width + 1, DIAGONAL);
        }
      }
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (x < width - 1) {
        relax(index, index + 1, STRAIGHT);
      }
      if (y < height - 1) {
        relax(index, index + width, STRAIGHT);
        if (x < width - 1) {
          relax(index, index + width + 1, DIAGONAL);
        }
        if (x > 0) {
          relax(index, index + width - 1, DIAGONAL);
        }
      }
    }
  }
  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = (distance[index] ?? 0) / STRAIGHT;
  }
  return distance;
}

// The drawing's lines, as a box in source pixels.
export function inkBounds(
  lightness: Uint8Array,
  width: number,
  height: number
) {
  let [left, top, right, bottom] = [width, height, 0, 0];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((lightness[y * width + x] ?? 255) < INK_LIGHTNESS) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return { bottom, left, right, top };
}

// The drawing's pixels in the icon's colors, RGBA at the source's size,
// from the source's lightness: what the page paints on its canvas and the
// icon scripts (scripts/app-icon.ts and its callers) write out. With a clear ground, only
// the dog and its rim are painted and the rest is see-through.
export function paintedPixels(
  lightness: Uint8Array,
  width: number,
  height: number,
  colors: IconColors,
  clearGround = false
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const outside = outsideOf(lightness, width, height);
  const ground = rgbOf(colors.ground);
  const dog = rgbOf(colors.dog);
  const line = rgbOf(colors.line);
  const { rim } = colors;
  const distance =
    rim === undefined ? undefined : distanceToDrawing(outside, width, height);
  // The rim's share of an outside pixel, softened over its last pixel.
  const rimShare = (index: number) =>
    rim === undefined || !distance
      ? 0
      : Math.min(1, Math.max(0, rim - (distance[index] ?? rim)));
  // Each pixel is its region's color darkened toward the line color by how
  // dark the drawing is there, so the lines keep their soft edges.
  for (let index = 0; index < lightness.length; index += 1) {
    const share = outside[index] ? rimShare(index) : 1;
    // A clear ground fades the rim out by opacity rather than into a color.
    const tint = clearGround ? 1 : share;
    const base = [0, 1, 2].map(
      (channel) =>
        (ground[channel] ?? 0) * (1 - tint) + (dog[channel] ?? 0) * tint
    );
    const ink = 1 - (lightness[index] ?? 255) / 255;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[offset + channel] = Math.round(
        (base[channel] ?? 0) * (1 - ink) + (line[channel] ?? 0) * ink
      );
    }
    pixels[offset + 3] = clearGround ? Math.round(share * 255) : 255;
  }
  return pixels;
}

// The key of the dog alone in the default icon's dark look.
export const DARK_DRAWING = "drawing-dark";
// The dog alone in its light look, white in dark lines, for light grounds.
export const LIGHT_DRAWING = "drawing-light";
export const lightDrawing: IconColors = {
  dog: "#ffffff",
  ground: "#ffffff",
  id: LIGHT_DRAWING,
  line: "#1d261b",
  name: "白",
  rim: 17,
};
