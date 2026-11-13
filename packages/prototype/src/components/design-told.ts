import { css } from "@pochical/styled-system/css";
import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

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

// Whether an element is in a phone a page tells, on a page that moves:
// what `_told` asks, for a change that has to be measured.
const isTold = (element: Element) =>
  element.closest("[data-told]") !== null &&
  CSS.supports("animation-timeline: view()") &&
  matchMedia("(prefers-reduced-motion: no-preference)").matches;

// The columns of a table giving way as one joins or leaves, where a page
// tells it: each column that was there before, named in `columns` in
// the order of the headings after the first, moves from where it stood to where it stands now over the
// same moment the new one comes in. The table is laid out once, as ever;
// each heading's place is read then, and only what is drawn moves. A step
// taken while one is still moving starts again from the places last read.
export function useColumnsGiveWay(
  table: RefObject<HTMLTableElement | null>,
  columns: string
) {
  const stood = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const element = table.current;
    if (!element) {
      return;
    }
    const { left, width } = element.getBoundingClientRect();
    // A phone drawn smaller than it is laid out has fewer of the page's
    // pixels to each of its own.
    const drawn = width / element.offsetWidth || 1;
    const stands = new Map<string, number>();
    const headings = element.querySelectorAll("thead th:not(:first-child)");
    for (const [index, name] of columns.split(" ").entries()) {
      const heading = headings[index];
      if (!heading) {
        break;
      }
      // Its middle, where what a cell holds stands.
      const box = heading.getBoundingClientRect();
      const at = (box.left + box.width / 2 - left) / drawn;
      stands.set(name, at);
      const was = stood.current.get(name);
      if (was !== undefined && was !== at && isTold(element)) {
        const cells = element.querySelectorAll(
          `tr > :nth-child(${index + 2}) > button`
        );
        for (const cell of cells) {
          cell.animate(
            { translate: [`${was - at}px 0`, "0 0"] },
            { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }
          );
        }
      }
    }
    stood.current = stands;
  }, [table, columns]);
}
