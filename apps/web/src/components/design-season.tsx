import confetti from "canvas-confetti";
import type { CreateTypes, Options, Shape } from "canvas-confetti";
import { useContext, useEffect, useRef } from "react";
import { css } from "styled-system/css";

import { seasonShapes } from "../lib/season-shapes";
import type { SeasonShape } from "../lib/season-shapes";
import { MonochromeContext, useMarkColors } from "./shift-mark";

// おたのしみ, the other choice for the calendar's month name: a tap scatters
// something of the month's season over the calendar instead of opening the
// month sheet. spec/month-name-seasons.md describes the same twelve for
// the native apps, which draw them with their own particle emitters.

// canvas-confetti is CommonJS: its functions hang off the default export,
// and named imports of them fail in the browser.
// oxlint-disable-next-line import/no-named-as-default-member -- see above
const { create, shapeFromPath } = confetti;

// The shift colors by their place in markColors.
const color = {
  blue: 9,
  indigo: 8,
  lavender: 7,
  moss: 0,
  mustard: 1,
  orange: 2,
  red: 4,
  rose: 5,
  slate: 11,
  teal: 10,
  terracotta: 3,
  violet: 6,
} as const;

type Point = { x: number; y: number };

// One throw of pieces: where from, which way (0° right, 90° up), how hard,
// how heavy, and for how long.
type Throw = Omit<Options, "colors" | "origin" | "shapes"> & {
  origin: Point;
};

type Season = {
  name: string;
  shape: SeasonShape | "circle";
  colors: number[];
  // Each throw in one of the colors rather than all of them mixed.
  eachInOneColor?: boolean;
  // The throws, each after its delay in ms, from `from`, the month name's
  // middle as a share of the screen.
  throws: (from: Point) => { after: number; throw: Throw }[];
};

const random = (low: number, high: number) =>
  low + Math.random() * (high - low);

// A throw every `every` ms for `count` times.
function repeat(
  count: number,
  every: number,
  make: (index: number) => Throw
): { after: number; throw: Throw }[] {
  return Array.from({ length: count }, (_, index) => ({
    after: index * every,
    throw: make(index),
  }));
}

// Pieces let go just over the screen's top edge, to fall over it all,
// each throw blown sideways by up to `sway`.
function fallingFrom({
  sway = 0,
  ...settings
}: Omit<Throw, "origin"> & { sway?: number }): () => Throw {
  return () => ({
    angle: 270,
    drift: random(-sway, sway),
    spread: 40,
    ...settings,
    origin: { x: random(0, 1), y: -0.05 },
  });
}

export const seasons: Season[] = [
  {
    // 初日: sparkles thrown out of the name, falling slowly.
    colors: [color.mustard, color.orange],
    name: "きらきら",
    shape: "sparkle",
    throws: (from) =>
      repeat(3, 180, () => ({
        angle: -50,
        flat: true,
        gravity: 0.35,
        origin: from,
        particleCount: 10,
        scalar: 1.4,
        spread: 80,
        startVelocity: 22,
        ticks: 140,
      })),
  },
  {
    colors: [color.red, color.rose],
    name: "梅",
    shape: "flower",
    throws: (from) =>
      repeat(2, 220, () => ({
        angle: -45,
        gravity: 0.6,
        origin: from,
        particleCount: 9,
        scalar: 2,
        spread: 70,
        startVelocity: 26,
        ticks: 170,
      })),
  },
  {
    // Butterflies let out of the name, fluttering off every which way.
    colors: [color.violet, color.mustard, color.lavender],
    name: "ちょうちょ",
    shape: "butterfly",
    throws: (from) =>
      repeat(7, 160, () => ({
        angle: random(-60, -20),
        drift: random(-1, 1),
        flat: true,
        gravity: 0.25,
        origin: from,
        particleCount: 1,
        scalar: 2,
        spread: 10,
        startVelocity: 16,
        ticks: 260,
      })),
  },
  {
    // Petals over the whole screen, fluttering as they fall.
    colors: [color.rose],
    name: "桜",
    shape: "petal",
    throws: () =>
      repeat(
        14,
        110,
        fallingFrom({
          gravity: 1,
          particleCount: 3,
          scalar: 1.3,
          startVelocity: 4,
          sway: 1,
          ticks: 280,
        })
      ),
  },
  {
    // New leaves carried across on a breeze from the left.
    colors: [color.moss, color.teal],
    name: "若葉",
    shape: "leaf",
    throws: () =>
      repeat(8, 140, () => ({
        angle: random(0, 20),
        drift: 0.6,
        gravity: 0.3,
        origin: { x: -0.05, y: random(0.15, 0.75) },
        particleCount: 2,
        scalar: 1.8,
        spread: 20,
        startVelocity: 26,
        ticks: 220,
      })),
  },
  {
    colors: [color.indigo, color.blue],
    name: "雨",
    shape: "drop",
    throws: () =>
      repeat(
        16,
        80,
        fallingFrom({
          flat: true,
          gravity: 3.5,
          particleCount: 3,
          scalar: 1.2,
          spread: 4,
          startVelocity: 20,
          ticks: 70,
        })
      ),
  },
  {
    // 七夕: a river of stars from the name down across the screen.
    colors: [color.mustard, color.lavender, color.blue],
    name: "天の川",
    shape: "star",
    throws: (from) =>
      repeat(10, 70, () => ({
        angle: -40,
        flat: true,
        gravity: 0.2,
        origin: from,
        particleCount: 4,
        scalar: 1,
        spread: 18,
        startVelocity: random(20, 34),
        ticks: 180,
      })),
  },
  {
    // Fireworks opening one after another over the month, each in one
    // color.
    colors: [
      color.red,
      color.orange,
      color.mustard,
      color.violet,
      color.indigo,
    ],
    eachInOneColor: true,
    name: "花火",
    shape: "circle",
    throws: () =>
      repeat(5, 320, () => ({
        decay: 0.9,
        flat: true,
        gravity: 0.3,
        origin: { x: random(0.2, 0.8), y: random(0.2, 0.55) },
        particleCount: 28,
        scalar: 0.7,
        spread: 360,
        startVelocity: 11,
        ticks: 70,
      })),
  },
  {
    // お月見: rabbits hopping across the month from the left, one after
    // another.
    colors: [color.slate, color.mustard],
    name: "うさぎ",
    shape: "rabbit",
    throws: () =>
      repeat(4, 280, () => ({
        angle: random(45, 60),
        flat: true,
        gravity: 0.7,
        origin: { x: -0.05, y: random(0.4, 0.7) },
        particleCount: 1,
        scalar: 2.4,
        spread: 6,
        startVelocity: random(22, 26),
        ticks: 170,
      })),
  },
  {
    // Acorns dropping and tumbling.
    colors: [color.orange, color.terracotta],
    name: "どんぐり",
    shape: "acorn",
    throws: () =>
      repeat(
        10,
        110,
        fallingFrom({
          gravity: 1.5,
          particleCount: 2,
          scalar: 1.8,
          spread: 20,
          startVelocity: 8,
          ticks: 160,
        })
      ),
  },
  {
    colors: [color.red, color.orange, color.mustard],
    name: "紅葉",
    shape: "leaf",
    throws: () =>
      repeat(
        12,
        130,
        fallingFrom({
          gravity: 1.1,
          particleCount: 2,
          scalar: 1.7,
          startVelocity: 4,
          sway: 1,
          ticks: 260,
        })
      ),
  },
  {
    colors: [color.indigo, color.lavender, color.blue],
    name: "雪",
    shape: "snowflake",
    throws: () =>
      repeat(
        16,
        120,
        fallingFrom({
          flat: true,
          gravity: 0.8,
          particleCount: 2,
          scalar: 1.2,
          startVelocity: 2,
          sway: 0.8,
          ticks: 320,
        })
      ),
  },
];

// Phosphor's grid is 256 wide with its drawing about 200 across; confetti
// draws a shape 10px across at scalar 1.
const GRID_MIDDLE = 128;
const PATH_SCALE = 10 / 200;
// The types say DOMMatrix, but confetti draws only a plain array; given
// none, it measures each path point by point, a stall on the first tap.
const pathMatrix = [
  PATH_SCALE,
  0,
  0,
  PATH_SCALE,
  -GRID_MIDDLE * PATH_SCALE,
  -GRID_MIDDLE * PATH_SCALE,
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
] as unknown as DOMMatrix;
// canvas-confetti's own startVelocity when a throw gives none.
const DEFAULT_VELOCITY = 45;
const shapeCache = new Map<SeasonShape, Shape>();

function shapeOf(name: SeasonShape): Shape {
  const cached = shapeCache.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const shape = shapeFromPath({
    matrix: pathMatrix,
    path: seasonShapes[name],
  });
  shapeCache.set(name, shape);
  return shape;
}

const seasonLayer = css({
  height: "100%",
  inset: 0,
  pointerEvents: "none",
  position: "absolute",
  width: "100%",
  zIndex: 30,
});

// A layer over the screen that the season is drawn on, and `play`, which
// scatters `month`'s season from `from`, the month name. Its colors are the
// shift colors, or all the テーマ's while shifts are drawn in one color.
export function useSeasons() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fireRef = useRef<CreateTypes>(null);
  const timers = useRef<number[]>([]);
  const markColors = useMarkColors();
  const { monochrome } = useContext(MonochromeContext);
  useEffect(
    () => () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
      fireRef.current?.reset();
    },
    []
  );
  function play(month: Date, from: Element) {
    const canvas = canvasRef.current;
    const season = seasons[month.getMonth()];
    if (canvas === null || season === undefined) {
      return;
    }
    const fire = fireRef.current ?? create(canvas);
    fireRef.current = fire;
    const area = canvas.getBoundingClientRect();
    // Confetti draws in the canvas's own pixels, so it gets the screen's
    // and its sizes and speeds grow with them; its own resizing would
    // leave a sharp screen's pieces blurred.
    const density = window.devicePixelRatio;
    const width = Math.round(area.width * density);
    const height = Math.round(area.height * density);
    // Setting a size clears the canvas, even the same size mid-season.
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const name = from.getBoundingClientRect();
    const origin = {
      x: (name.left + name.width / 2 - area.left) / area.width,
      y: (name.top + name.height / 2 - area.top) / area.height,
    };
    const colors = season.colors.map((index) =>
      monochrome ? markColors[0].color : (markColors[index]?.color ?? "")
    );
    const shapes: Shape[] = [
      season.shape === "circle" ? "circle" : shapeOf(season.shape),
    ];
    for (const { after, throw: settings } of season.throws(origin)) {
      const one = colors[Math.floor(Math.random() * colors.length)] ?? "";
      timers.current.push(
        window.setTimeout(() => {
          void fire({
            ...settings,
            colors: season.eachInOneColor === true ? [one] : colors,
            drift: (settings.drift ?? 0) * density,
            gravity: (settings.gravity ?? 1) * density,
            scalar: (settings.scalar ?? 1) * density,
            shapes,
            startVelocity:
              (settings.startVelocity ?? DEFAULT_VELOCITY) * density,
          });
        }, after)
      );
    }
  }
  const layer = (
    <canvas aria-hidden="true" className={seasonLayer} ref={canvasRef} />
  );
  return { layer, play };
}
