import { BatteryFull, Signal, Wifi } from "lucide-react";
import type { CSSProperties, ReactNode, Ref } from "react";
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
    bg: "background",
    color: "text",
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
          borderRadius: "44px",
          borderWidth: "5px",
          paddingInline: "10px",
        },
        border: "6px solid var(--ws-bezel)",
        borderRadius: "53px",
        boxShadow:
          "0 3px 0 1px var(--ws-bezel-edge), 0 28px 50px -30px var(--ws-bezel-shadow)",
        height: "844px",
        padding: "17px 16px 18px",
        position: "relative",
        width: "100%",
      },
      true: {
        inset: 0,
        paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
        paddingLeft: "calc(env(safe-area-inset-left) + 16px)",
        paddingRight: "calc(env(safe-area-inset-right) + 16px)",
        paddingTop: "max(env(safe-area-inset-top), 12px)",
        position: "fixed",
      },
    },
  },
});

const phone = {
  homeIndicator: css({
    bg: "var(--home-indicator)",
    borderRadius: "4px",
    flexShrink: 0,
    height: "5px",
    margin: "10px auto 0",
    width: "114px",
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
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    fontSize: "12px",
    fontWeight: 600,
    height: "28px",
    justifyContent: "space-between",
    padding: "0 14px",
    position: "relative",
  }),
  statusIcons: css({ alignItems: "center", display: "flex", gap: "4px" }),
};

function PhoneStatusBar() {
  return (
    <div aria-hidden="true" className={phone.statusBar}>
      <span>9:41</span>
      <span className={phone.island} />
      <span className={phone.statusIcons}>
        <Signal size={17} strokeWidth={2.6} />
        <Wifi size={18} strokeWidth={2.5} />
        <BatteryFull size={25} strokeWidth={1.8} />
      </span>
    </div>
  );
}

// The screens go between the status bar and the home indicator; the
// theme comes in through `style`.
export function Phone({
  children,
  fullScreen = false,
  ref,
  style,
}: {
  children: ReactNode;
  fullScreen?: boolean;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cx("dc-phone", frame({ fullScreen }))}
      ref={ref}
      style={style}
    >
      {!fullScreen && <PhoneStatusBar />}
      {children}
      {!fullScreen && (
        <div aria-hidden="true" className={phone.homeIndicator} />
      )}
    </div>
  );
}
