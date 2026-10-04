import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { css } from "styled-system/css";

import { spring } from "../lib/motion";

// Pages turned by a swipe, a flick or the wheel.

const pager = {
  // Pages of different heights, as a month and a week: the pager takes the
  // height of the one shown, which animates itself. At rest the track sits
  // a page to the left in CSS, so the middle page shows whatever the width
  // and before the script runs; the finger's offset goes on the layer
  // around it, and is nothing again once a swipe has landed.
  container: css({
    alignItems: "flex-start",
    display: "flex",
    transform: "translateX(-100%)",
  }),
  // Motion writes touch-action: pan-y on what it drags, which leaves the
  // page only to scroll up and down; pinching to zoom stays the browser's.
  drag: css({ touchAction: "pan-y pinch-zoom !important" }),
  slide: css({ flex: "0 0 100%", minWidth: 0 }),
  // clip rather than hidden: a hidden box can still be scrolled, as the
  // browser keeping its place while the grid folds, which slid the pages.
  viewport: css({ overflow: "clip" }),
};

type PageOffset = -1 | 0 | 1;

const pageOffsets: PageOffset[] = [-1, 0, 1];

// A swipe turns the page when let go past a quarter of it, or flicked
// faster than this many pixels a second, and turns one page at most.
const TURN_SHARE = 0.25;
const FLICK_SPEED = 400;
// How far a flick carries on, in seconds of its speed, when judging where
// it would come to rest.
const FLICK_CARRY = 0.2;

// Months and weeks run on both ways.
const endless = { back: true, forward: true };

// A trackpad's sideways swipe arrives as wheel events with no letting go;
// it has ended once none has come for this long.
const WHEEL_END_MS = 120;

// Pages that follow the finger sideways, as SwiftUI's TabView(.page) and
// Compose's HorizontalPager: months or weeks without end, or a few pages
// with ends, as the テーマ. Only the pages before and after are drawn;
// once a swipe lands, `onStep` moves on and the pager quietly goes back
// to the middle, which now shows the new page. Motion does the dragging,
// by finger or mouse; a trackpad's two-finger swipe turns it too.
export function Pager({
  page,
  onStep,
  renderPage,
  progress,
  ends = endless,
  gap = 0,
}: {
  // Names the page shown, so the pager recenters when it changes.
  page: string;
  onStep: (direction: 1 | -1) => void;
  renderPage: (offset: PageOffset) => ReactNode;
  // Set to how far the pages are dragged, -1 to 1 toward the next, for
  // what follows the drag, like the month's name over the calendar.
  progress?: MotionValue<number>;
  // Whether there is a page back and a page forward. At an end the drag
  // only gives a little, and the pager does not turn.
  ends?: { back: boolean; forward: boolean };
  // Room between pages, seen while they are dragged, in pixels.
  gap?: number;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  useMotionValueEvent(x, "change", (at) => {
    const pageWidth = viewportRef.current?.offsetWidth ?? 0;
    const share = pageWidth > 0 ? -at / (pageWidth + gap) : 0;
    progress?.set(Math.min(Math.max(share, -1), 1));
  });
  const reduceMotion = useReducedMotion() ?? false;
  // A page's width, only to keep a drag within the pages beside; the
  // pages are placed without it.
  const [width, setWidth] = useState(0);
  // Dragged since the finger went down, so letting go presses nothing.
  const dragged = useRef(false);
  // Going sideways, locked so by the drag: the page may not take the
  // finger to scroll.
  const sideways = useRef(false);
  // The pager is as tall as the page in the middle, whatever the pages
  // beside it hold, and follows it as it grows or shrinks, as when the
  // month turns into one week.
  useEffect(() => {
    const viewport = viewportRef.current;
    const container = containerRef.current;
    const middle = middleRef.current;
    if (!(viewport && container && middle)) {
      return;
    }
    const observer = new ResizeObserver(() => {
      container.style.height = `${middle.offsetHeight}px`;
      // Hidden, as behind another tab, it has no width to go by.
      if (viewport.offsetWidth > 0) {
        setWidth(viewport.offsetWidth);
      }
    });
    observer.observe(middle);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, []);
  // Safari scrolls the page under a sideways drag when the finger drifts
  // up or down, and takes the finger for it; Motion then ends the drag as
  // if let go, which turned the page halfway through a slow swipe. Once
  // the drag is sideways, the page stays put. Two fingers still pinch to
  // zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const hold = (event: TouchEvent) => {
      if (sideways.current && event.touches.length === 1 && event.cancelable) {
        event.preventDefault();
      }
    };
    viewport.addEventListener("touchmove", hold, { passive: false });
    return () => {
      viewport.removeEventListener("touchmove", hold);
    };
  }, []);
  // When the page changes otherwise, as by the arrows, mid-swipe, back to
  // the middle before the new page paints.
  const shownPage = useRef(page);
  useLayoutEffect(() => {
    if (shownPage.current !== page) {
      shownPage.current = page;
      x.jump(0);
    }
  }, [page, x]);
  // Taken from the finger, as by a call or the system, it goes back rather
  // than turning.
  const land = (velocity: number, taken: boolean) => {
    const pageWidth = viewportRef.current?.offsetWidth ?? 0;
    const stride = pageWidth + gap;
    if (pageWidth === 0) {
      x.jump(0);
      return;
    }
    const at = x.get();
    const flicked = Math.abs(velocity) > FLICK_SPEED;
    const rest = flicked ? at + velocity * FLICK_CARRY : at;
    const turned = !taken && Math.abs(rest) > pageWidth * TURN_SHARE;
    let direction: -1 | 0 | 1 = 0;
    if (turned) {
      direction = rest < 0 ? 1 : -1;
    }
    if (
      (direction === 1 && !ends.forward) ||
      (direction === -1 && !ends.back)
    ) {
      direction = 0;
    }
    // Landed, the pager goes back to the middle and the new page comes
    // in one go, with nothing painted between: what follows `progress`
    // only ever sees the new page with the drag done, whenever it takes
    // the drag up again.
    const settle = () => {
      if (direction === 0) {
        return;
      }
      x.jump(0);
      flushSync(() => {
        onStep(direction);
      });
    };
    const target = -direction * stride;
    if (reduceMotion) {
      x.jump(target);
      settle();
      return;
    }
    animate(x, target, {
      ...spring("standard"),
      onComplete: settle,
      velocity,
    });
  };
  const landRef = useRef(land);
  landRef.current = land;
  const reach = useRef({ back: 0, forward: 0 });
  reach.current = {
    back: ends.back ? width + gap : 0,
    forward: ends.forward ? width + gap : 0,
  };
  // A trackpad's sideways swipe moves the pages as a finger would. Past a
  // quarter it turns them there and then, and the rest of the swipe, which
  // runs on as the trackpad coasts, is let pass; stopped short, the pages
  // go back. Scrolling up and down is left to the page.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    let ended: ReturnType<typeof setTimeout> | undefined;
    let turned = false;
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }
      event.preventDefault();
      clearTimeout(ended);
      ended = setTimeout(() => {
        if (!turned) {
          landRef.current(0, false);
        }
        turned = false;
      }, WHEEL_END_MS);
      if (turned) {
        return;
      }
      const { back, forward } = reach.current;
      const at = Math.min(Math.max(x.get() - event.deltaX, -forward), back);
      x.set(at);
      const pageWidth = viewport.offsetWidth;
      if (Math.abs(at) > pageWidth * TURN_SHARE) {
        turned = true;
        landRef.current(0, false);
      }
    };
    viewport.addEventListener("wheel", wheel, { passive: false });
    return () => {
      clearTimeout(ended);
      viewport.removeEventListener("wheel", wheel);
    };
  }, [x]);
  return (
    <div className={pager.viewport} ref={viewportRef}>
      <motion.div
        className={pager.drag}
        drag="x"
        dragConstraints={{
          left: ends.forward ? -(width + gap) : 0,
          right: ends.back ? width + gap : 0,
        }}
        dragDirectionLock
        dragElastic={0.1}
        dragMomentum={false}
        onClickCapture={(event) => {
          if (dragged.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDirectionLock={(axis) => {
          sideways.current = axis === "x";
        }}
        onDragEnd={(event, info) => {
          sideways.current = false;
          land(info.velocity.x, event.type === "pointercancel");
        }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onPointerDownCapture={() => {
          dragged.current = false;
          sideways.current = false;
        }}
        style={{ x }}
      >
        <div
          className={pager.container}
          ref={containerRef}
          style={
            gap > 0
              ? { gap, transform: `translateX(calc(-100% - ${gap}px))` }
              : undefined
          }
        >
          {pageOffsets.map((offset) => (
            // The pages beside the one shown are only there to be dragged in.
            <div
              aria-hidden={offset !== 0}
              className={pager.slide}
              inert={offset !== 0}
              key={offset}
              ref={offset === 0 ? middleRef : undefined}
            >
              {renderPage(offset)}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
