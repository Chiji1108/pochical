import { motion } from "motion/react";
import { useContext, useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";

import type { DesignVariants } from "../lib/design-variants";
import { ColorSchemeContext } from "./design-theme";
import { MonochromeContext, useMarkColors } from "./shift-mark";

// おたのしみ, the other choice for the calendar's month name: a tap brings
// the month's season to the calendar instead of opening the month sheet.
// Two ways are being compared (the 比べる案 おたのしみ):
// - 空気: a few soft pieces drift behind the dates, near ones large and
//   out of focus, far ones small and sharp, over a haze of the season's
//   color spreading from the name.
// - マス: the days themselves answer, each lifting a little and washing
//   over in the season's color, in a wave from the name or settling row
//   by row.
// Only 桜 and 雪 are drawn so far: 桜 from March to August, 雪 the rest.

type Look = DesignVariants["seasonLook"];

type Season = "sakura" | "snow";

// The shift colors by their place in markColors.
const ROSE = 5;
const INDIGO = 8;
const MARCH = 2;
const AUGUST = 7;

function seasonOf(month: Date): Season {
  const index = month.getMonth();
  return index >= MARCH && index <= AUGUST ? "sakura" : "snow";
}

const random = (low: number, high: number) =>
  low + Math.random() * (high - low);
const mix = (from: number, to: number, share: number) =>
  from + (to - from) * share;

// One piece of 空気, drifting on its own path. Depth runs from 0, far
// away, to 1, right in front.
type Piece = {
  id: number;
  depth: number;
  size: number;
  blur: number;
  opacity: number;
  delay: number;
  duration: number;
  x: number[];
  y: number[];
  rotate: number[];
  flip: number[];
};

const STEPS = [0, 0.25, 0.5, 0.75, 1];

// Pieces start already in the air, some above the screen, and fade in and
// out on the way, so the air fills at once rather than waiting for a fall.
function piecesFor(season: Season, width: number, height: number): Piece[] {
  const sakura = season === "sakura";
  const count = sakura ? 22 : 26;
  return Array.from({ length: count }, (_, id) => {
    const depth = Math.random() ** 1.3;
    const size = sakura ? mix(12, 64, depth ** 1.6) : mix(4, 64, depth ** 2.2);
    // In focus around the middle: the nearest are soft, the farthest a
    // little soft too.
    const blur = Math.max(0, depth - 0.62) * 26 + Math.max(0, 0.15 - depth) * 8;
    const opacity =
      depth > 0.7 ? mix(0.55, 0.35, depth) : mix(0.55, 0.9, depth);
    // Near pieces travel farther in the same time, as they would.
    const fall = height * mix(0.3, 1, depth) * (sakura ? 1 : 0.8);
    const startY = random(-0.2, 0.55) * height - size;
    const startX = random(-0.15, 0.95) * width;
    const wind = sakura ? width * mix(0.08, 0.3, depth) : 0;
    const sway = sakura ? mix(8, 28, depth) : mix(4, 18, depth);
    const phase = random(0, Math.PI * 2);
    const turn = random(90, 220);
    const tilt = random(-30, 30);
    return {
      blur,
      delay: random(0, 1.1),
      depth,
      duration: sakura ? random(4.6, 6) : random(5, 6.6),
      flip: STEPS.map((step) => (sakura ? Math.sin(phase + step * 5) * 65 : 0)),
      id,
      opacity,
      rotate: STEPS.map((step) => (sakura ? tilt + step * turn : 0)),
      size,
      x: STEPS.map(
        (step) => startX + wind * step + Math.sin(phase + step * 4) * sway
      ),
      y: STEPS.map((step) => startY + fall * step),
    };
  });
}

// A cherry petal on a 100 grid: round, with a notch at its outer end.
const PETAL =
  "M50,96C22,80,10,52,20,24C28,8,40,6,46,18L50,26L54,18C60,6,72,8,80,24C90,52,78,80,50,96Z";

function PieceShape({
  season,
  color,
  id,
}: {
  season: Season;
  color: string;
  id: string;
}) {
  if (season === "sakura") {
    return (
      <svg aria-hidden="true" height="100%" viewBox="0 0 100 100" width="100%">
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="1" y2="0">
            <stop offset="0" style={{ stopColor: color }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0.45 }} />
          </linearGradient>
        </defs>
        <path d={PETAL} fill={`url(#${id})`} />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" height="100%" viewBox="0 0 100 100" width="100%">
      <defs>
        <radialGradient id={id}>
          <stop offset="0" style={{ stopColor: color, stopOpacity: 0.7 }} />
          <stop offset="0.45" style={{ stopColor: color, stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" fill={`url(#${id})`} r="50" />
    </svg>
  );
}

type Round = {
  key: number;
  season: Season;
  color: string;
  from: { x: number; y: number };
  pieces: Piece[];
};

// How long a round of 空気 stays drawn: its latest piece's delay and
// duration, with the haze's fade.
const ROUND_MS = 7800;
const HAZE_SECONDS = 6.4;
const FADE = [0, 0.18, 0.72, 1];

// The days as the wave reaches them: 桜 spreads from the name, 雪 settles
// from the top row down.
const WAVE_MS_PER_PX = 1.5;
const ROW_MS = 150;
const SAKURA_WASH_MS = 1100;
const SNOW_WASH_MS = 2400;
const clear = "inset 0 0 0 100px transparent";

function washCells(season: Season, color: string, from: DOMRect) {
  const screen = document.documentElement.clientWidth;
  const cells = [...document.querySelectorAll<HTMLElement>("[data-day-cell]")]
    .map((cell) => ({ cell, rect: cell.getBoundingClientRect() }))
    // Only the page in sight, not the months waiting beside it.
    .filter(({ rect }) => {
      const middle = rect.left + rect.width / 2;
      return rect.width > 0 && middle > 0 && middle < screen;
    });
  const top = Math.min(...cells.map(({ rect }) => rect.top));
  const tinted = (share: number) =>
    `color-mix(in oklab, ${color} ${share}%, transparent)`;
  const wash = `inset 0 0 0 100px ${tinted(26)}`;
  // Snow resting on each day's top edge.
  const cap = `inset 0 7px 6px -4px ${tinted(45)}`;
  const noCap = "inset 0 0 0 0 transparent";
  for (const { cell, rect } of cells) {
    if (season === "sakura") {
      const distance = Math.hypot(
        rect.left + rect.width / 2 - (from.left + from.width / 2),
        rect.top + rect.height / 2 - (from.top + from.height / 2)
      );
      cell.animate(
        [
          { boxShadow: clear, transform: "none" },
          {
            boxShadow: wash,
            offset: 0.35,
            transform: "translateY(-3px) scale(1.06)",
          },
          { boxShadow: clear, transform: "none" },
        ],
        {
          delay: distance * WAVE_MS_PER_PX,
          duration: SAKURA_WASH_MS,
          easing: "cubic-bezier(0.3, 0, 0.2, 1)",
        }
      );
    } else {
      const row = Math.round((rect.top - top) / rect.height);
      cell.animate(
        [
          { boxShadow: noCap, transform: "none" },
          { boxShadow: cap, offset: 0.25, transform: "translateY(2px)" },
          { boxShadow: cap, offset: 0.7, transform: "none" },
          { boxShadow: noCap, transform: "none" },
        ],
        {
          delay: row * ROW_MS + random(0, 160),
          duration: SNOW_WASH_MS,
          easing: "ease-out",
        }
      );
    }
  }
}

function Haze({ round }: { round: Round }) {
  return (
    <motion.div
      animate={{ opacity: [0, 1, 1, 0] }}
      className={seasonStyles.haze}
      initial={{ opacity: 0 }}
      style={{
        background: `radial-gradient(circle at ${round.from.x}px ${round.from.y}px, color-mix(in oklab, ${round.color} 16%, transparent), transparent 75%)`,
      }}
      transition={{ duration: HAZE_SECONDS, ease: "easeInOut", times: FADE }}
    />
  );
}

function Drifting({ round, piece }: { round: Round; piece: Piece }) {
  return (
    <motion.div
      animate={{
        opacity: [0, piece.opacity, piece.opacity, 0],
        rotate: piece.rotate,
        rotateY: piece.flip,
        x: piece.x,
        y: piece.y,
      }}
      className={seasonStyles.piece}
      initial={{ opacity: 0, x: piece.x[0], y: piece.y[0] }}
      style={{
        filter: piece.blur > 0.5 ? `blur(${piece.blur}px)` : undefined,
        height: piece.size,
        transformPerspective: 400,
        width: piece.size,
        zIndex: Math.round(piece.depth * 10),
      }}
      transition={{
        delay: piece.delay,
        duration: piece.duration,
        ease: "linear",
        opacity: {
          delay: piece.delay,
          duration: piece.duration,
          ease: "easeInOut",
          times: FADE,
        },
      }}
    >
      <PieceShape
        color={round.color}
        id={`season-${round.key}-${piece.id}`}
        season={round.season}
      />
    </motion.div>
  );
}

// The layer 空気 is drawn on, behind the screen's content (its Screen
// takes `seasonStyles.screen`), and `play`, which brings `month`'s season
// from `from`, the month name. Its colors are the shift colors, or the
// テーマ's while shifts are drawn in one color.
export function useSeasons(look: Look) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const timers = useRef<number[]>([]);
  const markColors = useMarkColors();
  const { monochrome } = useContext(MonochromeContext);
  const scheme = useContext(ColorSchemeContext);
  useEffect(
    () => () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    },
    []
  );
  function play(month: Date, from: Element) {
    const season = seasonOf(month);
    const own = season === "sakura" ? ROSE : INDIGO;
    const color = markColors[monochrome ? 0 : own]?.color ?? "";
    const name = from.getBoundingClientRect();
    if (look === "cells") {
      washCells(season, color, name);
      return;
    }
    const layer = layerRef.current;
    if (layer === null) {
      return;
    }
    // Shift colors are deep in light mode; petals are paler than that.
    const pieceColor =
      scheme === "light" && season === "sakura"
        ? `color-mix(in oklab, ${color} 65%, white)`
        : color;
    const area = layer.getBoundingClientRect();
    const key = Date.now();
    setRounds((previous) => [
      ...previous,
      {
        color: pieceColor,
        from: {
          x: name.left + name.width / 2 - area.left,
          y: name.top + name.height / 2 - area.top,
        },
        key,
        pieces: piecesFor(season, area.width, area.height),
        season,
      },
    ]);
    timers.current.push(
      window.setTimeout(() => {
        setRounds((previous) => previous.filter((round) => round.key !== key));
      }, ROUND_MS)
    );
  }
  const layer = (
    <div aria-hidden="true" className={seasonStyles.layer} ref={layerRef}>
      {rounds.map((round) => (
        <div className={seasonStyles.round} key={round.key}>
          <Haze round={round} />
          {round.pieces.map((piece) => (
            <Drifting key={piece.id} piece={piece} round={round} />
          ))}
        </div>
      ))}
    </div>
  );
  return { layer, play };
}

export const seasonStyles = {
  haze: css({ inset: 0, position: "absolute" }),
  layer: css({
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    // Behind everything else on the screen, which isolates itself so the
    // layer stays in front of the screen's own ground.
    zIndex: -1,
  }),
  piece: css({ left: 0, position: "absolute", top: 0 }),
  round: css({ inset: 0, position: "absolute" }),
  // The calendar's Screen, so the layer can sit behind its content.
  screen: css({ isolation: "isolate" }),
};
