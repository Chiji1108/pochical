import { BatteryFull, Signal, Wifi } from "lucide-react";
import { animate } from "motion/react";
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode, Ref, RefObject } from "react";
import { css, cva, cx } from "styled-system/css";

// The phone the /design screens are shown in: its frame, status bar and
// home indicator. They stand in for the device, so the native apps have no
// counterpart; what carries over is the screens inside. Its height is
// fixed, so a screen's bottom controls stay in the frame. `dc-phone` stays
// on the frame as the hook toasts and tools/layout-diff find it by.
const frame = cva({
  base: {
    // Phones show scroll indicators only while scrolling, so the desktop
    // browser's scrollbars stay hidden inside.
    "& *": { scrollbarWidth: "none" },
    bg: "background.base",
    color: "text.primary",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    scrollbarWidth: "none",
  },
  defaultVariants: { fullScreen: false },
  variants: {
    // On /try the screens fill a real phone: no frame, no pictured status
    // bar or home indicator, and the device's own kept clear.
    fullScreen: {
      false: {
        "@media (max-width: 370px)": {
          "--screen-left": "10px",
          "--screen-right": "10px",
          borderRadius: "44px",
          borderWidth: "5px",
        },
        border: "6px solid var(--ws-bezel)",
        borderRadius: "53px",
        boxShadow:
          "0 3px 0 1px var(--ws-bezel-edge), 0 28px 50px -30px var(--ws-bezel-shadow)",
        height: "844px",
        // The foot is iOS's home indicator area, 33pt: the screens end
        // there, and the floating tab bar sits 20px off the bottom.
        "--safe-bottom": "33px",
        // The top, down to where the screens start: the room above the
        // status bar and the bar itself.
        "--safe-top": "45px",
        // The room at the screens' sides, which a ground running to the
        // phone's edges, like entering's, reaches back out by.
        "--screen-left": "16px",
        "--screen-right": "16px",
        "--tab-bar-bottom": "20px",
        padding: "17px var(--screen-right) 33px var(--screen-left)",
        position: "relative",
        width: "100%",
      },
      true: {
        inset: 0,
        "--safe-bottom": "max(env(safe-area-inset-bottom), 12px)",
        "--safe-top": "max(env(safe-area-inset-top), 12px)",
        "--screen-left": "calc(env(safe-area-inset-left) + 16px)",
        "--screen-right": "calc(env(safe-area-inset-right) + 16px)",
        // As iOS's: 21pt off a phone's foot, 13pt into its home indicator
        // area.
        "--tab-bar-bottom":
          "max(calc(env(safe-area-inset-bottom) - 13px), 12px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
        paddingLeft: "var(--screen-left)",
        paddingRight: "var(--screen-right)",
        paddingTop: "max(env(safe-area-inset-top), 12px)",
        position: "fixed",
      },
    },
  },
});

const phone = {
  // Where iOS draws it, 8pt off the foot, over whatever runs under it.
  homeIndicator: css({
    ".dc-phone:has([data-status-bar=light]:not([hidden])) &": {
      bg: "media.text",
    },
    bg: "home.indicator",
    borderRadius: "4px",
    bottom: "8px",
    height: "5px",
    left: "50%",
    position: "absolute",
    transform: "translateX(-50%)",
    width: "114px",
    zIndex: 12,
  }),
  island: css({
    "@media (max-width: 370px)": { width: "76px" },
    bg: "var(--ws-island)",
    borderRadius: "20px",
    height: "27px",
    left: "50%",
    position: "absolute",
    transform: "translateX(-50%)",
    width: "92px",
  }),
  statusBar: css({
    "@media (max-width: 370px)": { paddingInline: "6px" },
    // Light over a screen that asks for it, like the camera's.
    ".dc-phone:has([data-status-bar=light]:not([hidden])) &": {
      color: "media.text",
    },
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    fontSize: "12px",
    fontWeight: 600,
    height: "28px",
    justifyContent: "space-between",
    padding: "0 14px",
    position: "relative",
    // Over a screen's own layers that run up under it, as おたのしみ's.
    zIndex: 1,
  }),
  statusIcons: css({ alignItems: "center", display: "flex", gap: "4px" }),
};

// Without the time on the lock screen, whose own clock tells it.
function PhoneStatusBar({ time }: { time: boolean }) {
  return (
    <div aria-hidden="true" className={phone.statusBar}>
      <span>{time && "9:41"}</span>
      <span className={phone.island} />
      <span className={phone.statusIcons}>
        <Signal size={17} strokeWidth={2.6} />
        <Wifi size={18} strokeWidth={2.5} />
        <BatteryFull size={25} strokeWidth={1.8} />
      </span>
    </div>
  );
}

// Past this, a mouse's press is a drag rather than a click.
const DRAG_SLOP = 6;
// How far a let-go drag coasts on, in seconds of its speed, and for how
// long.
const COAST_CARRY = 0.3;
const COAST_SECONDS = 0.6;

function sidewaysScroller(from: Element, device: HTMLElement) {
  for (
    let at: Element | null = from;
    at && at !== device;
    at = at.parentElement
  ) {
    const { overflowX } = getComputedStyle(at);
    if (
      at instanceof HTMLElement &&
      (overflowX === "auto" || overflowX === "scroll") &&
      at.scrollWidth > at.clientWidth
    ) {
      return at;
    }
  }
  return null;
}

// A mouse drags what scrolls sideways, as a finger would on the phone, so
// rows like 1人ずつ's people can be reached from a computer without a
// trackpad. Only the stand-in phone needs it: on the device, and in the
// native apps, the finger does this already. Pagers drag themselves;
// fields and text are left to the mouse.
function useMouseAsFinger(phoneRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const device = phoneRef.current;
    if (!device) {
      return;
    }
    let press:
      | {
          scroller: HTMLElement;
          startLeft: number;
          startX: number;
          startY: number;
          lastX: number;
          lastTime: number;
          velocity: number;
        }
      | undefined;
    let dragging = false;
    let stop: (() => void) | undefined;
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) {
        return;
      }
      const { target } = event;
      if (
        !(target instanceof Element) ||
        target.closest("input, textarea, select, [contenteditable=true]")
      ) {
        return;
      }
      const scroller = sidewaysScroller(target, device);
      if (!scroller) {
        return;
      }
      stop?.();
      press = {
        lastTime: event.timeStamp,
        lastX: event.clientX,
        scroller,
        startLeft: scroller.scrollLeft,
        startX: event.clientX,
        startY: event.clientY,
        velocity: 0,
      };
      dragging = false;
    };
    const move = (event: PointerEvent) => {
      if (!press) {
        return;
      }
      const movedX = event.clientX - press.startX;
      const movedY = event.clientY - press.startY;
      if (!dragging) {
        if (Math.max(Math.abs(movedX), Math.abs(movedY)) < DRAG_SLOP) {
          return;
        }
        // Up and down is the page's, or a selection's.
        if (Math.abs(movedY) > Math.abs(movedX)) {
          press = undefined;
          return;
        }
        dragging = true;
        press.scroller.setPointerCapture(event.pointerId);
        press.scroller.style.userSelect = "none";
        getSelection()?.removeAllRanges();
      }
      const elapsed = (event.timeStamp - press.lastTime) / 1000;
      if (elapsed > 0) {
        press.velocity = (event.clientX - press.lastX) / elapsed;
      }
      press.lastX = event.clientX;
      press.lastTime = event.timeStamp;
      press.scroller.scrollLeft = press.startLeft - movedX;
    };
    const up = () => {
      if (!(press && dragging)) {
        press = undefined;
        return;
      }
      const { scroller, velocity } = press;
      press = undefined;
      scroller.style.userSelect = "";
      const from = scroller.scrollLeft;
      const coast = animate(from, from - velocity * COAST_CARRY, {
        duration: COAST_SECONDS,
        ease: [0.2, 0.8, 0.2, 1],
        onUpdate: (left) => {
          scroller.scrollLeft = left;
        },
      });
      stop = () => {
        coast.stop();
      };
    };
    // The click that ends a drag picks nothing.
    const click = (event: MouseEvent) => {
      if (dragging) {
        dragging = false;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    device.addEventListener("pointerdown", down);
    device.addEventListener("pointermove", move);
    device.addEventListener("pointerup", up);
    device.addEventListener("pointercancel", up);
    device.addEventListener("click", click, true);
    return () => {
      stop?.();
      device.removeEventListener("pointerdown", down);
      device.removeEventListener("pointermove", move);
      device.removeEventListener("pointerup", up);
      device.removeEventListener("pointercancel", up);
      device.removeEventListener("click", click, true);
    };
  }, [phoneRef]);
}

// The screens go between the status bar and the home indicator; the
// theme comes in through `style`.
export function Phone({
  children,
  fullScreen = false,
  locked = false,
  ref,
  style,
}: {
  children: ReactNode;
  fullScreen?: boolean;
  // The lock screen: the status bar leaves out the time.
  locked?: boolean;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}) {
  const phoneRef = useRef<HTMLDivElement>(null);
  useMouseAsFinger(phoneRef);
  return (
    <div
      className={cx("dc-phone", frame({ fullScreen }))}
      ref={(node) => {
        phoneRef.current = node;
        if (typeof ref === "function") {
          return ref(node);
        }
        if (ref) {
          ref.current = node;
        }
      }}
      style={style}
    >
      {!fullScreen && <PhoneStatusBar time={!locked} />}
      {children}
      {!fullScreen && (
        <div aria-hidden="true" className={phone.homeIndicator} />
      )}
    </div>
  );
}
