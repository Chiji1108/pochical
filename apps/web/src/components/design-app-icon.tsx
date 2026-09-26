import { createContext, useEffect, useState } from "react";

// The app icon from the poodle drawing: black lines on white. The outside
// of the dog is found by flooding in from the edges, so the ground can take
// a color while the dog stays white.

type IconColors = {
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
const darkTwins: IconColors[] = [
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

const SOURCE = "/design/poodle.png";
const ICON_SIZE = 1024;
// Share of the icon's width the drawing's lines take, leaving room for the
// rounded corners the system cuts.
const DRAWING_SHARE = 0.74;
// Brighter than this counts as paper when finding the outside.
const PAPER_LIGHTNESS = 128;
// Darker than this counts as a line when measuring the drawing's bounds.
const INK_LIGHTNESS = 100;

type Rgb = [number, number, number];

function rgbOf(hex: string): Rgb {
  return [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  ) as Rgb;
}

// Marks every paper pixel reachable from the image's edges.
function outsideOf(lightness: Uint8Array, width: number, height: number) {
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
function distanceToDrawing(outside: Uint8Array, width: number, height: number) {
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
function inkBounds(lightness: Uint8Array, width: number, height: number) {
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

function paintIcon(image: HTMLImageElement, colors: IconColors) {
  const { naturalWidth: width, naturalHeight: height } = image;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) {
    return "";
  }
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, width, height);
  const lightness = new Uint8Array(width * height);
  for (let index = 0; index < lightness.length; index += 1) {
    const offset = index * 4;
    lightness[index] = Math.round(
      ((pixels.data[offset] ?? 0) +
        (pixels.data[offset + 1] ?? 0) +
        (pixels.data[offset + 2] ?? 0)) /
        3
    );
  }
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
    const base = [0, 1, 2].map(
      (channel) =>
        (ground[channel] ?? 0) * (1 - share) + (dog[channel] ?? 0) * share
    );
    const ink = 1 - (lightness[index] ?? 255) / 255;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels.data[offset + channel] = Math.round(
        (base[channel] ?? 0) * (1 - ink) + (line[channel] ?? 0) * ink
      );
    }
    pixels.data[offset + 3] = 255;
  }
  sourceContext.putImageData(pixels, 0, 0);

  const bounds = inkBounds(lightness, width, height);
  const drawn = Math.max(
    bounds.right - bounds.left,
    bounds.bottom - bounds.top
  );
  const scale = (ICON_SIZE * DRAWING_SHARE) / drawn;
  const icon = document.createElement("canvas");
  icon.width = ICON_SIZE;
  icon.height = ICON_SIZE;
  const context = icon.getContext("2d");
  if (!context) {
    return "";
  }
  context.fillStyle = colors.ground;
  context.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  context.drawImage(
    source,
    ICON_SIZE / 2 - centerX * scale,
    ICON_SIZE / 2 - centerY * scale,
    width * scale,
    height * scale
  );
  return icon.toDataURL("image/png");
}

// Painted once for the whole page, since each color walks every pixel.
let paintedIcons: Promise<Record<string, string>> | undefined;

async function paintAll() {
  const image = new Image();
  image.src = SOURCE;
  await image.decode();
  return Object.fromEntries(
    [...iconColorOptions, ...darkTwins].map((colors) => [
      colors.id,
      paintIcon(image, colors),
    ])
  );
}

async function loadIcons(): Promise<Record<string, string>> {
  paintedIcons ??= paintAll();
  return await paintedIcons;
}

// Every color's icon, as image URLs by id, once the drawing has loaded.
export function useAppIcons() {
  const [icons, setIcons] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    void loadIcons().then((loaded) => {
      if (current) {
        setIcons(loaded);
      }
    });
    return () => {
      current = false;
    };
  }, []);
  return icons;
}

// The icons someone can pick in settings, ダーク among them.
export const pickableIcons = iconColorOptions;

// The picked icon's id, from the アプリアイコン settings.
export const AppIconContext = createContext<{
  icon: string;
  setIcon?: (icon: string) => void;
}>({ icon: "moss" });

// An icon as the system shows it: cut to a rounded square.
export function AppIcon({ src, size }: { src?: string; size: number }) {
  return (
    <span className="ai-icon" style={{ height: size, width: size }}>
      {src ? <img alt="" height={size} src={src} width={size} /> : null}
    </span>
  );
}

const homeSizes = [
  { label: "ホーム画面", size: 60 },
  { label: "Spotlight", size: 40 },
  { label: "設定・通知", size: 29 },
];

// Neighbors on the home screen, so the icon is judged among others.
const neighbors = ["#f2b233", "#4c8ef7", "#34c759", "#ff5b5b", "#8e8e93"];

export function DesignAppIcon() {
  const icons = useAppIcons();
  const [picked, setPicked] = useState(iconColorOptions[0]?.id ?? "moss");
  const src = icons[picked];
  return (
    <div className="ai-study">
      <div className="ai-choices">
        {pickableIcons.map((option) => (
          <button
            aria-pressed={picked === option.id}
            className="ai-choice"
            key={option.id}
            onClick={() => {
              setPicked(option.id);
            }}
            type="button"
          >
            <AppIcon size={96} src={icons[option.id]} />
            <span>{option.name}</span>
            {/* On a home screen set to dark icons. */}
            <span className="ai-twin">
              <AppIcon
                size={32}
                src={icons[darkTwinOf[option.id] ?? option.id]}
              />
              暗い見た目
            </span>
          </button>
        ))}
      </div>
      <div className="ai-sizes">
        {homeSizes.map(({ label, size }) => (
          <figure key={label}>
            <AppIcon size={size} src={src} />
            <figcaption>
              {label}
              <small>{size}pt</small>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="ai-homes">
        {(["light", "dark"] as const).map((scheme) => (
          <div className={`ai-home ai-home-${scheme}`} key={scheme}>
            {neighbors.map((color, index) => (
              <span className="ai-app" key={color}>
                <span
                  aria-hidden="true"
                  className="ai-icon ai-neighbor"
                  style={{ background: color }}
                />
                <small>アプリ{index + 1}</small>
              </span>
            ))}
            <span className="ai-app">
              <AppIcon
                size={60}
                src={
                  scheme === "dark" ? icons[darkTwinOf[picked] ?? picked] : src
                }
              />
              <small>ポチカル</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
