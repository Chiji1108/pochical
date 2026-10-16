import { radii } from "@pochical/design/metrics";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "styled-system/css";

import { chatStyle } from "./design-chat-style";

const round = (value: number) => Math.round(value * 100) / 100;

// A bubble's outline, as the iOS app's BubbleShape draws it: round all
// over at lg, but the first of a run, as LINE draws one: from a notch in
// its top corner by the writer's side a horn rises to a tip level with
// the top edge, 0.6 of the radius past the box (the room chatStyle.body
// keeps by the face; by the screen's edge it reaches into the margin),
// and curves back in to the side. One outline, never a tail laid on a
// corner (spec/chat.md, In a message). Drawn as one's own, its tail at
// the top right; others' are mirrored.
export function bubblePath(
  width: number,
  height: number,
  mine: boolean,
  first: boolean
): string {
  const r = Math.min(radii.lg, width / 2, height / 2);
  const x = (at: number) => round(mine ? at : width - at);
  const point = (at: number, y: number) => `${x(at)} ${round(y)}`;
  // Mirrored, each arc turns the other way.
  const arc = (at: number, y: number) =>
    `A ${r} ${r} 0 0 ${mine ? 1 : 0} ${point(at, y)}`;
  // The corner by the writer: down its arc to a notch three quarters of
  // the way in, up the horn to the tip and back in to the side.
  const notch = { x: width - 0.25 * r, y: r - Math.sqrt(0.4375) * r };
  const tip = { x: width + 0.6 * r, y: 0 };
  const corner = first
    ? [
        arc(notch.x, notch.y),
        `C ${point(notch.x + 0.2 * r, notch.y - 0.25 * r)} ${point(tip.x - 0.35 * r, 0.04 * r)} ${point(tip.x, tip.y)}`,
        `C ${point(tip.x - 0.3 * r, 0.12 * r)} ${point(width, 0.55 * r)} ${point(width, Math.min(1.5 * r, height - r))}`,
      ]
    : [arc(width, r)];
  return [
    `M ${point(r, 0)}`,
    `L ${point(width - r, 0)}`,
    ...corner,
    `L ${point(width, height - r)}`,
    arc(width - r, height),
    `L ${point(r, height)}`,
    arc(0, height - r),
    `L ${point(0, r)}`,
    arc(r, 0),
    "Z",
  ].join(" ");
}

// A bubble drawn in its outline: measured as it lays out, the outline
// filled behind what it holds, which is clipped to it (a link's page to
// its corners), and the ring a jump gives it drawn along it. Its box is
// what the words take; the tail reaches out of it.
export function BubbleOutline({
  mine,
  first,
  className,
  style,
  children,
}: {
  mine: boolean;
  first: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<{ height: number; width: number }>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    // Its box as laid out, not as a lift or a press scales it.
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.borderBoxSize.at(0);
      if (box !== undefined) {
        setSize({ height: box.blockSize, width: box.inlineSize });
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const outline =
    size === undefined
      ? undefined
      : bubblePath(size.width, size.height, mine, first);
  return (
    <span
      className={cx(chatStyle.bubbleFrame, className)}
      data-part="bubble"
      style={style}
    >
      {outline !== undefined && (
        <svg
          aria-hidden="true"
          className={chatStyle.bubbleFill({ mine })}
          height={size?.height}
          width={size?.width}
        >
          <path d={outline} />
        </svg>
      )}
      <span
        className={chatStyle.bubble({ mine })}
        ref={ref}
        style={
          outline === undefined ? undefined : { clipPath: `path("${outline}")` }
        }
      >
        {children}
      </span>
      {outline !== undefined && (
        <svg
          aria-hidden="true"
          className={chatStyle.bubbleRing}
          data-part="bubble-ring"
          height={size?.height}
          width={size?.width}
        >
          <path d={outline} />
        </svg>
      )}
    </span>
  );
}
