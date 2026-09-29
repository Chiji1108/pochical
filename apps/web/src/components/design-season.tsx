import { GodRays, MeshGradient, Warp } from "@paper-design/shaders-react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { hexToOklch, oklchToHex } from "../lib/oklch";
import { ColorSchemeContext } from "./design-theme";
import { MonochromeContext, useMarkColors } from "./shift-mark";

// おたのしみ, the other choice for the calendar's month name: a tap floods
// the screen behind the calendar with the month's season as color, light
// and movement, no objects: it spreads out from the name, sways for a few
// seconds and draws back. Drawn with Paper Shaders, whose GLSL the native
// apps can port to Metal (iOS) and AGSL (Android 13+).
// Four are drawn so far, each standing in for its quarter of the year:
// 初日の出 (December–February), 桜 (March–May), 雨 (June–August) and
// 紅葉 (September–November).

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

type Scheme = "light" | "dark";

// A shift color brought toward the screen's ground: toward white in light
// mode, toward a deep tone in dark mode, keeping its hue.
function soften(hex: string, share: number, scheme: Scheme) {
  const { lightness, chroma, hue } = hexToOklch(hex);
  const ground = scheme === "light" ? 0.99 : 0.2;
  return oklchToHex({
    chroma: chroma * (1 - share * 0.6),
    hue,
    lightness: lightness + (ground - lightness) * share,
  });
}

type Paint = (hex: (index: number, share?: number) => string) => ReactNode;

type Season = { name: string; paint: Paint };

const seasons: Record<"dawn" | "sakura" | "rain" | "autumn", Season> = {
  // 初日の出: warm light rising from below the screen.
  dawn: {
    name: "初日の出",
    paint: (hex) => (
      <GodRays
        bloom={0.5}
        className={seasonStyles.fill}
        colorBack={hex(color.lavender, 0.85)}
        colorBloom={hex(color.orange, 0.45)}
        colors={[
          hex(color.mustard, 0.35),
          hex(color.orange, 0.45),
          hex(color.rose, 0.55),
        ]}
        density={0.3}
        intensity={0.7}
        midIntensity={0.5}
        midSize={0.35}
        offsetY={0.95}
        speed={0.5}
        spotty={0.35}
      />
    ),
  },
  // 桜: pale pinks opening and turning slowly, with a little grain.
  sakura: {
    name: "桜",
    paint: (hex) => (
      <MeshGradient
        className={seasonStyles.fill}
        colors={[
          hex(color.rose, 0.7),
          hex(color.rose, 0.92),
          hex(color.lavender, 0.9),
          hex(color.rose, 0.55),
        ]}
        distortion={0.8}
        grainMixer={0.15}
        grainOverlay={0.12}
        speed={0.5}
        swirl={0.35}
      />
    ),
  },
  // 雨: blue grays running down like rain on a window.
  rain: {
    name: "雨",
    paint: (hex) => (
      <Warp
        className={seasonStyles.fill}
        colors={[
          hex(color.indigo, 0.8),
          hex(color.slate, 0.6),
          hex(color.blue, 0.9),
          hex(color.teal, 0.75),
        ]}
        distortion={0.12}
        proportion={0.45}
        rotation={90}
        shape="stripes"
        shapeScale={0.6}
        softness={0.55}
        speed={2}
        swirl={0.05}
        swirlIterations={2}
      />
    ),
  },
  // 紅葉: reds, oranges and golds mingling as they flow.
  autumn: {
    name: "紅葉",
    paint: (hex) => (
      <MeshGradient
        className={seasonStyles.fill}
        colors={[
          hex(color.red, 0.35),
          hex(color.orange, 0.3),
          hex(color.mustard, 0.45),
          hex(color.terracotta, 0.55),
        ]}
        distortion={1}
        grainMixer={0.2}
        grainOverlay={0.15}
        speed={0.6}
        swirl={0.6}
      />
    ),
  },
};

const DECEMBER = 11;
const MARCH = 2;
const JUNE = 5;
const SEPTEMBER = 8;

function seasonOf(month: Date): Season {
  const index = month.getMonth();
  if (index === DECEMBER || index < MARCH) {
    return seasons.dawn;
  }
  if (index < JUNE) {
    return seasons.sakura;
  }
  if (index < SEPTEMBER) {
    return seasons.rain;
  }
  return seasons.autumn;
}

// Spreading out from the name, staying, drawing back.
const SPREAD_SECONDS = 1.1;
const STAY_SECONDS = 3.4;
const LEAVE_SECONDS = 1.4;

type Round = { key: number; paint: ReactNode; from: { x: number; y: number } };

// One flood: the season's paint, seen through a circle growing from the
// month name until it covers the screen, then fading away.
function Flood({ round, onDone }: { round: Round; onDone: () => void }) {
  const radius = useMotionValue(0);
  const opacity = useMotionValue(1);
  const mask = useMotionTemplate`radial-gradient(circle at ${round.from.x}px ${round.from.y}px, black ${radius}px, transparent calc(${radius}px + 160px))`;
  useEffect(() => {
    const spread = animate(radius, 1400, {
      duration: SPREAD_SECONDS,
      ease: [0.3, 0, 0.2, 1],
    });
    const leave = animate(opacity, 0, {
      delay: SPREAD_SECONDS + STAY_SECONDS,
      duration: LEAVE_SECONDS,
      ease: "easeInOut",
    });
    void leave.then(onDone);
    return () => {
      spread.stop();
      leave.stop();
    };
  }, [onDone, opacity, radius]);
  return (
    <motion.div
      className={seasonStyles.fill}
      style={{ WebkitMaskImage: mask, maskImage: mask, opacity }}
    >
      {round.paint}
    </motion.div>
  );
}

// The layer the seasons are drawn on, behind the screen's content (its
// Screen takes `seasonStyles.screen`), and `play`, which floods it with
// `month`'s season from `from`, the month name. Its colors are the shift
// colors, or the テーマ's while shifts are drawn in one color.
export function useSeasons() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState<Round>();
  const markColors = useMarkColors();
  const { monochrome } = useContext(MonochromeContext);
  const scheme = useContext(ColorSchemeContext);
  const clear = useCallback(() => {
    setRound(undefined);
  }, []);
  function play(month: Date, from: Element) {
    const layer = layerRef.current;
    if (layer === null) {
      return;
    }
    const hex = (index: number, share = 0) =>
      soften(
        markColors[monochrome ? 0 : index]?.color ?? "#888888",
        share,
        scheme
      );
    const area = layer.getBoundingClientRect();
    const name = from.getBoundingClientRect();
    setRound({
      from: {
        x: name.left + name.width / 2 - area.left,
        y: name.top + name.height / 2 - area.top,
      },
      key: Date.now(),
      paint: seasonOf(month).paint(hex),
    });
  }
  const layer = (
    <div aria-hidden="true" className={seasonStyles.layer} ref={layerRef}>
      {round === undefined ? null : (
        <Flood key={round.key} onDone={clear} round={round} />
      )}
    </div>
  );
  return { layer, play };
}

export const seasonStyles = {
  fill: css({ height: "100%", inset: 0, position: "absolute", width: "100%" }),
  layer: css({
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    // Behind everything else on the screen, which isolates itself so the
    // layer stays in front of the screen's own ground.
    zIndex: -1,
  }),
  // The calendar's Screen, so the layer can sit behind its content.
  screen: css({ isolation: "isolate" }),
};
