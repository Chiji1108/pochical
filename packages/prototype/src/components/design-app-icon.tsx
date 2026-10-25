import { css, cva, cx } from "@pochical/styled-system/css";
import { useEffect, useState } from "react";

import poodle from "../assets/poodle.png?url";
import {
  darkTwinOf,
  darkTwins,
  DARK_DRAWING,
  DRAWING_SHARE,
  ICON_SIZE,
  iconColorOptions,
  inkBounds,
  LIGHT_DRAWING,
  lightDrawing,
  paintedPixels,
} from "../lib/app-icon-paint";
import type { IconColors } from "../lib/app-icon-paint";
import { useDevice } from "../lib/design-device";
import { useSettings } from "../lib/design-settings-store";
import { Choice, ChoiceGrid } from "./design-choices";

// The app icon as the pages paint it, on a canvas from the drawing.

// The drawing in the icon's colors, at the source's size, on a canvas.
function paintDrawing(
  image: HTMLImageElement,
  colors: IconColors,
  clearGround = false
) {
  const { naturalWidth: width, naturalHeight: height } = image;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) {
    return;
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
  pixels.data.set(paintedPixels(lightness, width, height, colors, clearGround));
  sourceContext.putImageData(pixels, 0, 0);
  return { lightness, source };
}

function paintIcon(image: HTMLImageElement, colors: IconColors) {
  const drawing = paintDrawing(image, colors);
  if (!drawing) {
    return "";
  }
  const { lightness, source } = drawing;
  const { naturalWidth: width, naturalHeight: height } = image;
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
  image.src = poodle;
  await image.decode();
  const icons: Record<string, string> = Object.fromEntries(
    [...iconColorOptions, ...darkTwins].map((colors) => [
      colors.id,
      paintIcon(image, colors),
    ])
  );
  // The default icon's dark look without its ground, for drawing the dog
  // straight onto a dark screen.
  const mossDark = darkTwins.find((colors) => colors.id === "moss-dark");
  if (mossDark) {
    icons[DARK_DRAWING] =
      paintDrawing(image, mossDark, true)?.source.toDataURL("image/png") ?? "";
  }
  icons[LIGHT_DRAWING] =
    paintDrawing(image, lightDrawing, true)?.source.toDataURL("image/png") ??
    "";
  return icons;
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

// The icon on the home screen: the one picked on iOS; Android's launcher
// shows the app's own, as it has no アプリアイコン
// (spec/sync-protocol.md, Preferences).
export function useAppIconInUse() {
  const platform = useDevice((state) => state.platform);
  const picked = useSettings((state) => state.device.appIcon);
  return platform === "ios" ? picked : (iconColorOptions[0]?.id ?? picked);
}

// An icon as the system shows it: cut to a rounded square, close to the
// system's continuous corner at icon sizes.
const appIcon = css({
  "& img": { display: "block", height: "100%", width: "100%" },
  bg: "fill.tertiary",
  borderRadius: "22.5%",
  boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.12)",
  display: "inline-block",
  flexShrink: 0,
  overflow: "hidden",
});

export function AppIcon({ src, size }: { src?: string; size: number }) {
  return (
    <span className={appIcon} style={{ height: size, width: size }}>
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

// The colors to pick from, each with its dark twin; the icon at the
// system's sizes; and two home screens, light and dark, with neighbors.
const study = {
  // A neighbor's icon: a plain color in the icon's shape, a little faded
  // so the icon stands out.
  neighbor: css({ height: "60px", opacity: 0.85, width: "60px" }),
  app: css({
    "& > small": {
      color: "#ffffff",
      fontSize: "10px",
      textShadow: "0 1px 2px rgb(0 0 0 / 0.35)",
    },
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  }),
  choice: css({
    _checked: { borderColor: "var(--border-strong)", color: "text.primary" },
    alignItems: "center",
    bg: "transparent",
    border: "1px solid transparent",
    borderRadius: "20px",
    color: "text.secondary",
    display: "flex",
    flexDirection: "column",
    fontSize: "12px",
    gap: "8px",
    padding: "10px",
  }),
  choices: css({
    display: "flex",
    flexWrap: "wrap",
    gap: "14px",
    justifyContent: "center",
  }),
  home: cva({
    base: {
      borderRadius: "28px",
      display: "grid",
      gap: "18px 22px",
      gridTemplateColumns: "repeat(3, 60px)",
      padding: "26px 24px",
    },
    variants: {
      scheme: {
        dark: { background: "linear-gradient(160deg, #1b2230, #2d2420)" },
        light: { background: "linear-gradient(160deg, #7f9cc0, #c49a80)" },
      },
    },
  }),
  homes: css({
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    justifyContent: "center",
  }),
  root: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "28px",
    width: "min(100%, 520px)",
  }),
  sizes: css({
    "& > figure": {
      alignItems: "center",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      margin: 0,
    },
    "& > figure > figcaption": {
      alignItems: "center",
      color: "text.tertiary",
      display: "flex",
      flexDirection: "column",
      fontSize: "11px",
    },
    alignItems: "flex-end",
    display: "flex",
    gap: "28px",
  }),
  twin: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    fontSize: "10px",
    gap: "6px",
  }),
};

export function DesignAppIcon() {
  const icons = useAppIcons();
  const [picked, setPicked] = useState(iconColorOptions[0]?.id ?? "moss");
  const src = icons[picked];
  return (
    <div className={study.root}>
      <ChoiceGrid
        className={study.choices}
        label="アイコンの色"
        onValueChange={setPicked}
        value={picked}
      >
        {pickableIcons.map((option) => (
          <Choice className={study.choice} key={option.id} value={option.id}>
            <AppIcon size={96} src={icons[option.id]} />
            <span>{option.name}</span>
            {/* On a home screen set to dark icons. */}
            <span className={study.twin}>
              <AppIcon
                size={32}
                src={icons[darkTwinOf[option.id] ?? option.id]}
              />
              暗い見た目
            </span>
          </Choice>
        ))}
      </ChoiceGrid>
      <div className={study.sizes}>
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
      <div className={study.homes}>
        {(["light", "dark"] as const).map((scheme) => (
          <div className={study.home({ scheme })} key={scheme}>
            {neighbors.map((color, index) => (
              <span className={study.app} key={color}>
                <span
                  aria-hidden="true"
                  className={cx(appIcon, study.neighbor)}
                  style={{ background: color }}
                />
                <small>アプリ{index + 1}</small>
              </span>
            ))}
            <span className={study.app}>
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
