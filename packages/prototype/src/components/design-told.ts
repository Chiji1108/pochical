import { css } from "@pochical/styled-system/css";

// What a step brings in where a page tells a screen's changes itself, a
// step at a time, rather than a person making them (the site's /next,
// which marks its phones `data-told`; `_told` is that, on a page that
// moves). A step's change is whole at once, so each new thing comes in
// over a moment of its own, started by its being there: a step skipped
// over leaves nothing waiting, and one taken back simply takes it away.
// The screens a person works have none of this.
const moment = {
  transitionDuration: "0.2s",
  transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

export const told = {
  // A mark or a face, from a little small.
  pop: css({
    _told: {
      ...moment,
      "@starting-style": { opacity: 0, scale: 0.6 },
      transitionProperty: "opacity, scale",
    },
  }),
  // A chat line, from a little under where it stands.
  rise: css({
    _told: {
      ...moment,
      "@starting-style": { opacity: 0, translate: "0 10px" },
      transitionProperty: "opacity, translate",
    },
  }),
  // A column's cell, from the side it joins on.
  slide: css({
    _told: {
      ...moment,
      "@starting-style": { opacity: 0, translate: "14px 0" },
      transitionProperty: "opacity, translate",
    },
  }),
};
