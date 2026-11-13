// The story the top page tells as it is scrolled (pages/index.astro): one tall
// section whose stage stays on screen, and where the page is in it, 0 at
// its start to 1 at its end, saying what the stage shows. The page's CSS
// moves what only fades and slides, on the section's own scroll timeline;
// the phones that show more of the app with each step (components/
// lp-screens.tsx) read the place from here. Kept free of React, as
// lib/presses.ts is.

// The story's parts, in the stores' order, each the stretch of the place
// it is told in.
// Entering starts from a month already entered through its second week
// and enters the rest, 15 presses of the month's 25, so it has that share
// of the 0.3 a whole month took, a press as long a scroll as it was; what
// that leaves is the later parts'.
export const BEATS = {
  chat: { from: 0.7, to: 1 },
  entry: { from: 0.08, to: 0.28 },
  friends: { from: 0.44, to: 0.7 },
  hero: { from: 0, to: 0.08 },
  widgets: { from: 0.28, to: 0.44 },
} as const;

type Stretch = { from: number; to: number };

// The parts in the order they are told, and the one a place is in.
const ORDER = ["hero", "entry", "widgets", "friends", "chat"] as const;
export const beatAt = (place: number) =>
  ORDER.findLast((name) => place >= BEATS[name].from) ?? ORDER[0];

// The stretch a phone's steps are spread over, inside its part: after its
// words are in, and done with room to look at the last step.
export const SCENES = {
  chat: { from: BEATS.chat.from + 0.03, to: 0.97 },
  entry: { from: BEATS.entry.from + 0.012, to: BEATS.entry.to - 0.035 },
  friends: { from: BEATS.friends.from + 0.035, to: BEATS.friends.to - 0.06 },
} as const;

// A stretch as the page's CSS takes it: `--from` and `--to`, hundredths of
// the story, for a piece's `animation-range`.
export const rangeOf = ({ from, to }: Stretch) => ({
  "--from": `${(from * 100).toFixed(1)}%`,
  "--to": `${(to * 100).toFixed(1)}%`,
});

// Which of `steps` steps a stretch is at, 0 to `steps - 1`: the first
// before it, the last after it.
export const stepOf = (stretch: Stretch, steps: number, place: number) => {
  const through = (place - stretch.from) / (stretch.to - stretch.from);
  return Math.min(steps - 1, Math.max(0, Math.floor(through * steps)));
};

// Whether the page moves with its scroll: where the browser has
// scroll-driven animations and less motion is not asked for, as the page's
// CSS asks (_moving). Elsewhere the story is a row of still scenes.
let lessMotionQuery: MediaQueryList | undefined;
const lessMotion = () => {
  lessMotionQuery ??= matchMedia("(prefers-reduced-motion: reduce)");
  return lessMotionQuery;
};
export const moves = () =>
  CSS.supports("animation-timeline: view()") && !lessMotion().matches;

// The place, read once a frame while the page scrolls or its size
// changes, and only while someone listens.
let place = 0;
let frame = 0;
const listeners = new Set<() => void>();

const read = () => {
  const story = document.querySelector("[data-story]");
  if (!story) {
    return 0;
  }
  const { height, top } = story.getBoundingClientRect();
  const span = height - window.innerHeight;
  return span > 0 ? Math.min(1, Math.max(0, -top / span)) : 0;
};

const tell = () => {
  for (const listener of listeners) {
    listener();
  }
};

const update = () => {
  frame = 0;
  const next = read();
  if (next !== place) {
    place = next;
    tell();
  }
};

const onScroll = () => {
  if (frame === 0) {
    frame = requestAnimationFrame(update);
  }
};

export const placeNow = (): number => place;

export const subscribe = (listener: () => void): (() => void) => {
  if (listeners.size === 0) {
    place = read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    lessMotion().addEventListener("change", tell);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      lessMotion().removeEventListener("change", tell);
    }
  };
};
