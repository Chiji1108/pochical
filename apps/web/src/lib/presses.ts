// How many times each of the top page's ポチッと。 has been pressed, by the
// sky it drifts: the hero's (top) and the closing one's (sides). The
// buttons are the page's own HTML, counting from its first moment; a sky
// is an island (lp-screens.tsx) that reads the count once its code is in,
// presses made before then included. Kept free of React, which the page's
// own script does not load.
export type SkyPlace = "top" | "sides";

const counts: Record<SkyPlace, number> = { sides: 0, top: 0 };
const listeners = new Set<() => void>();

export const press = (place: SkyPlace): void => {
  counts[place] += 1;
  for (const listener of listeners) {
    listener();
  }
};

export const pressesOf = (place: SkyPlace): number => counts[place];

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
