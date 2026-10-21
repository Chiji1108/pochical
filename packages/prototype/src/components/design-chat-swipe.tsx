import { chatRules } from "@pochical/design/chat";
import { css, cx } from "@pochical/styled-system/css";
import { Reply } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRef } from "react";
import type { PointerEvent, ReactNode } from "react";

import { useReducedMotion } from "../lib/device-media";
import { spring } from "../lib/motion";

// A line dragged sideways, toward the middle from its writer's side,
// starts a reply to it, as Signal, Telegram and LINE drag one: the reply
// arrow shows in the room it leaves, full at chatRules.replySwipe, and the
// line springs back as it is let go. Only a drag mostly across: one
// aslant stays a scroll. The phones mark the moment it is far enough
// with a haptic (spec/haptics.md), which the web cannot play.

// How far a finger moves before it is a drag rather than a press.
const slop = 10;

const arrowSize = 28;

const swipe = css({ position: "relative", touchAction: "pan-y" });

const arrow = css({
  alignItems: "center",
  alignSelf: "center",
  bg: "fill.tertiary",
  borderRadius: "full",
  color: "text.secondary",
  display: "flex",
  height: `${arrowSize}px`,
  justifyContent: "center",
  pointerEvents: "none",
  position: "absolute",
  top: `calc(50% - ${arrowSize / 2}px)`,
  width: `${arrowSize}px`,
});

export function SwipeToReply({
  mine,
  onReply,
  disabled = false,
  className,
  children,
}: {
  mine: boolean;
  onReply: () => void;
  // A line the menu has no 返信 on, like one still on its way.
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const sign = mine ? -1 : 1;
  const shown = useTransform(x, (value) =>
    Math.min(1, Math.abs(value) / chatRules.replySwipe)
  );
  const scale = useTransform(shown, (value) => 0.5 + 0.5 * value);
  // In the middle of the room the line leaves.
  const arrowShift = useTransform(x, (value) =>
    Math.max(arrowSize / 2, Math.abs(value) / 2)
  );
  const arrowAt = useTransform(arrowShift, (value) => -value - arrowSize / 2);
  const start = useRef<{ id: number; x: number; y: number }>(undefined);
  const swiping = useRef(false);
  const far = useRef(false);
  // The click a drag ends with is not the line's own.
  const swiped = useRef(false);
  const letGo = () => {
    start.current = undefined;
    swiping.current = false;
    far.current = false;
    animate(x, 0, reduceMotion ? { duration: 0 } : spring("quick"));
  };
  return (
    <motion.span
      className={cx(className, swipe)}
      onClickCapture={(event) => {
        if (swiped.current) {
          swiped.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onPointerCancel={letGo}
      onPointerDown={(event: PointerEvent) => {
        if (disabled || event.button !== 0) {
          return;
        }
        swiped.current = false;
        start.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }}
      onPointerMove={(event: PointerEvent<HTMLSpanElement>) => {
        const from = start.current;
        if (from?.id !== event.pointerId) {
          return;
        }
        const across = event.clientX - from.x;
        const down = event.clientY - from.y;
        if (!swiping.current) {
          if (Math.hypot(across, down) < slop) {
            return;
          }
          if (Math.abs(across) <= Math.abs(down) * 2 || across * sign <= 0) {
            start.current = undefined;
            return;
          }
          swiping.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        const along = Math.max(0, across * sign);
        far.current = along >= chatRules.replySwipe;
        const shift =
          along <= chatRules.replySwipe
            ? along
            : chatRules.replySwipe +
              (along - chatRules.replySwipe) * chatRules.replySwipeRubber;
        x.set(sign * shift);
      }}
      onPointerUp={() => {
        if (swiping.current) {
          swiped.current = true;
          // Only the click this drag ends with, if any comes.
          window.setTimeout(() => {
            swiped.current = false;
          }, 0);
          if (far.current) {
            onReply();
          }
        }
        letGo();
      }}
      style={{ x }}
    >
      <motion.span
        aria-hidden="true"
        className={arrow}
        style={{
          [mine ? "right" : "left"]: arrowAt,
          opacity: shown,
          scale,
        }}
      >
        <Reply size={16} />
      </motion.span>
      {children}
    </motion.span>
  );
}
