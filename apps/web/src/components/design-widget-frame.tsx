import type { CSSProperties, ReactNode } from "react";
import { css, cva } from "styled-system/css";

import type { ColorScheme } from "../lib/design-tokens";
import { ColorSchemeContext, useThemeStyle } from "./design-theme";

// Stand-ins for where the widgets are shown: the home screen's wallpaper,
// the widget's own frame at its size, and the looks the system gives it.
// Like design-phone, they stand in for the device, so the native apps have
// no counterpart; WidgetKit and Glance draw these themselves.

// Home screen widgets' corners, as a plain circle that matches the
// system's: measured from an iPhone 16 Pro (about 26pt at 402pt wide,
// scaled to 390) and a Pixel 9a (about 21dp).
const IOS_RADIUS = 25;
const ANDROID_RADIUS = 21;
// The margins the system keeps around a home screen widget's content
// (16pt on iPhone, measured as well; Material's 16dp on Android). The lock
// screen's widgets have none.
const HOME_MARGIN = 16;

const iosHome = { margin: HOME_MARGIN, radius: IOS_RADIUS };
const iosLock = { margin: 0, radius: 0 };
const androidHome = { margin: HOME_MARGIN, radius: ANDROID_RADIUS };

// iPhone sizes in pt for a 390 × 844 phone, the one the /design screens
// are drawn at, from Apple's Human Interface Guidelines (Widgets); an
// iPhone 16 Pro's measure the same once scaled from 402 to 390.
// Android sizes in dp as a Pixel 9a's launcher gives them: its cells
// are 97dp wide and 107dp tall, less the room between them.
export const widgetFamilies = {
  accessoryCircular: { ...iosLock, height: 72, label: "円形", width: 72 },
  accessoryInline: { ...iosLock, height: 26, label: "1行", width: 234 },
  accessoryRectangular: {
    ...iosLock,
    height: 72,
    label: "長方形",
    width: 160,
  },
  android2x2: { ...androidHome, height: 202, label: "2×2", width: 179 },
  android4x2: { ...androidHome, height: 202, label: "4×2", width: 373 },
  android4x4: { ...androidHome, height: 415, label: "4×4", width: 373 },
  systemLarge: { ...iosHome, height: 354, label: "大", width: 338 },
  systemMedium: { ...iosHome, height: 158, label: "中", width: 338 },
  systemSmall: { ...iosHome, height: 158, label: "小", width: 158 },
} as const;
export type WidgetFamily = keyof typeof widgetFamilies;

// The home screen's looks for widgets: ライト and ダーク in full color;
// 色合い and クリア drawn by the system in its accented mode, where every
// piece of the widget becomes one flat white, keeping only how opaque it
// is, over a tinted or glass ground in place of the widget's own.
export type HomeAppearance = "light" | "dark" | "tinted" | "clear";
export const homeAppearances: { appearance: HomeAppearance; label: string }[] =
  [
    { appearance: "light", label: "ライト" },
    { appearance: "dark", label: "ダーク" },
    { appearance: "tinted", label: "色合い" },
    { appearance: "clear", label: "クリア" },
  ];

// A person's own pick for 色合い; a sample one here.
const SAMPLE_TINT = "oklch(0.78 0.11 75)";

// Words that stay as tiers of one white in the system's flat looks, as
// SwiftUI's .primary / .secondary do.
const flatText = {
  "--text-primary": "#fff",
  "--text-quaternary": "rgb(255 255 255 / 0.25)",
  "--text-secondary": "rgb(255 255 255 / 0.6)",
  "--text-tertiary": "rgb(255 255 255 / 0.4)",
};

const frame = cva({
  base: {
    color: "text.primary",
    flexShrink: 0,
    overflow: "hidden",
    position: "relative",
  },
  variants: {
    look: {
      clear: {
        backdropFilter: "blur(24px) saturate(1.4)",
        bg: "rgb(255 255 255 / 0.14)",
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.28)",
      },
      full: { bg: "background.base" },
      // The lock screen draws no ground; only what the widget draws.
      lock: {},
      tinted: {
        backdropFilter: "blur(24px)",
        bg: `color-mix(in oklab, ${SAMPLE_TINT} 32%, rgb(24 22 20 / 0.62))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${SAMPLE_TINT} 40%, transparent)`,
      },
    },
  },
});

// The widget's content as the system draws it in each look.
const content = cva({
  base: { height: "100%" },
  variants: {
    rendering: {
      // Every piece one flat white, keeping its opacity.
      accented: { filter: "brightness(0) invert(1)" },
      fullColor: {},
      // The lock screen's: grays that the wallpaper shows through.
      vibrant: { filter: "grayscale(1) brightness(1.6)" },
    },
  },
});

function lookOf(appearance: HomeAppearance | "lock") {
  if (appearance === "lock") {
    return "lock";
  }
  return appearance === "light" || appearance === "dark" ? "full" : appearance;
}

function renderingOf(appearance: HomeAppearance | "lock") {
  if (appearance === "lock") {
    return "vibrant";
  }
  return appearance === "light" || appearance === "dark"
    ? "fullColor"
    : "accented";
}

// One widget at its size, in a look.
export function WidgetFrame({
  family,
  appearance,
  children,
}: {
  family: WidgetFamily;
  appearance: HomeAppearance | "lock";
  children: ReactNode;
}) {
  const scheme: ColorScheme = appearance === "light" ? "light" : "dark";
  return (
    <ColorSchemeContext value={scheme}>
      <ThemedFrame appearance={appearance} family={family}>
        {children}
      </ThemedFrame>
    </ColorSchemeContext>
  );
}

function ThemedFrame({
  family,
  appearance,
  children,
}: {
  family: WidgetFamily;
  appearance: HomeAppearance | "lock";
  children: ReactNode;
}) {
  const theme = useThemeStyle();
  const { width, height, margin, radius } = widgetFamilies[family];
  const rendering = renderingOf(appearance);
  const style = {
    ...theme,
    ...(rendering === "fullColor" ? {} : flatText),
    borderRadius: radius,
    height,
    padding: margin,
    width,
  } as CSSProperties;
  return (
    <div className={frame({ look: lookOf(appearance) })} style={style}>
      <div className={content({ rendering })}>{children}</div>
    </div>
  );
}

const wallpaper = css({
  // A phone's width is narrower than the large widget with room around it.
  "@media (max-width: 760px)": { padding: "16px" },
  alignItems: "flex-start",
  borderRadius: "32px",
  display: "flex",
  flexWrap: "wrap",
  gap: "20px",
  overflowX: "auto",
  padding: "24px",
});

// Airy pastels for a light home screen, something bright for the glass of
// クリア to show, and darker ones where the system darkens the wallpaper.
const grounds: Record<HomeAppearance | "lock", string> = {
  clear:
    "linear-gradient(135deg, oklch(0.72 0.12 30), oklch(0.66 0.12 250) 55%, oklch(0.78 0.1 150))",
  dark: "linear-gradient(135deg, oklch(0.3 0.04 250), oklch(0.22 0.05 290) 60%, oklch(0.28 0.05 330))",
  light:
    "linear-gradient(135deg, oklch(0.93 0.04 150), oklch(0.9 0.05 230) 55%, oklch(0.93 0.05 320))",
  lock: "linear-gradient(160deg, oklch(0.42 0.06 250), oklch(0.3 0.06 290) 55%, oklch(0.36 0.07 20))",
  tinted:
    "linear-gradient(135deg, oklch(0.26 0.03 70), oklch(0.2 0.03 40) 60%, oklch(0.24 0.04 20))",
};

// A stretch of wallpaper the widgets sit on, in a look.
export function Wallpaper({
  appearance,
  children,
}: {
  appearance: HomeAppearance | "lock";
  children: ReactNode;
}) {
  return (
    <div className={wallpaper} style={{ background: grounds[appearance] }}>
      {children}
    </div>
  );
}

const labelled = css({
  "& > figcaption": {
    color: "rgb(255 255 255 / 0.85)",
    fontSize: "11px",
    textAlign: "center",
  },
  "&[data-ground=light] > figcaption": { color: "rgb(0 0 0 / 0.5)" },
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  margin: 0,
});

// A widget with its size under it.
export function LabelledWidget({
  family,
  appearance,
  children,
}: {
  family: WidgetFamily;
  appearance: HomeAppearance | "lock";
  children: ReactNode;
}) {
  const { width, height, label } = widgetFamilies[family];
  const unit = family.startsWith("android") ? "dp" : "pt";
  return (
    <figure className={labelled} data-ground={appearance}>
      <WidgetFrame appearance={appearance} family={family}>
        {children}
      </WidgetFrame>
      <figcaption>
        {label} {width}×{height}
        {unit}
      </figcaption>
    </figure>
  );
}
