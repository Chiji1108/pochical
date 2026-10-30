import arrowBackSymbol from "@iconify-icons/material-symbols/arrow-back-outline-rounded";
import { css, cva, cx } from "@pochical/styled-system/css";
import { Check, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { useDevice } from "../lib/design-device";
import { MaterialSymbol } from "./design-symbol";
import { iconButtonStyle, SCREEN_SCROLL_GAP } from "./design-ui";
import type { ButtonProps } from "./design-ui";

// A screen's top: the way back, its actions, 完了 and 今月.

// 完了 at a screen's top right, for the mode that has to be left on
// purpose: entering shifts, an order typed on the calendar.
// Each platform's own: iOS 26 draws a confirming bar button as its
// symbol alone, the heading's icon buttons' round in the accent, naming
// itself only to a screen reader; Material's is a filled button with its
// word.
const materialDoneStyle = css({
  _disabled: {
    bg: "fill.quaternary",
    color: "text.disabled",
    cursor: "default",
  },
  alignItems: "center",
  bg: "accent.fill",
  border: 0,
  borderRadius: "2xl",
  color: "accent.onFill",
  display: "inline-flex",
  flexShrink: 0,
  gap: "8px",
  height: "touch",
  justifyContent: "center",
  paddingInline: "20px",
  textStyle: "subheadline",
});

export function DoneButton({ className, ...props }: ButtonProps) {
  const platform = useDevice((state) => state.platform);
  if (platform === "ios") {
    return (
      <button
        aria-label="完了"
        className={cx(iconButtonStyle({ confirms: true }), className)}
        type="button"
        {...props}
      >
        <Check aria-hidden="true" size={22} strokeWidth={2.5} />
      </button>
    );
  }
  return (
    <button
      className={cx(materialDoneStyle, className)}
      type="button"
      {...props}
    >
      <Check aria-hidden="true" size={18} />
      完了
    </button>
  );
}

// 今月 or 今週: back to the month or week that holds today, dimmed once
// there.
// As iOS 26's bar buttons with words, like the calendar's 今日: the word
// in a round-ended piece of glass.
const todayButtonStyle = css({
  _disabled: { color: "text.disabled", cursor: "default" },
  bg: "fill.quaternary",
  border: 0,
  borderRadius: "full",
  color: "text.primary",
  flexShrink: 0,
  height: "touch",
  paddingInline: "16px",
  textStyle: "body",
});

export function TodayButton({
  unit,
  ...props
}: ButtonProps & { unit: "月" | "週" | "日" }) {
  return (
    <ReturnButton aria-label={`今${unit}に戻る`} {...props}>
      今{unit}
    </ReturnButton>
  );
}

// The same word in glass, back to where a page belongs, as 今月 is to
// today: 1日目へ, back to the month of an order's 1st day.
export function ReturnButton({ className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(todayButtonStyle, className)}
      type="button"
      {...props}
    />
  );
}

// Back to where the page came from, named after it (設定, グループ), or
// キャンセル without the chevron where leaving drops what was entered.
// Without children it is the chevron alone, labelled 戻る. Disabled, it
// keeps its place but hides, as while a list is being sorted.
// The way back, as iOS 26 and Android draw it: an arrow alone, naming
// where it goes only to a screen reader. iOS's chevron sits in a round of
// glass; Android's ← (Material's arrow_back) is a standard icon button,
// on no ground of its own.
const backButtonStyle = cva({
  base: {
    _disabled: { visibility: "hidden" },
    alignItems: "center",
    alignSelf: "flex-start",
    border: 0,
    borderRadius: "full",
    color: "text.primary",
    display: "inline-flex",
    flexShrink: 0,
    height: "touch",
    justifyContent: "center",
    width: "touch",
  },
  variants: {
    platform: {
      android: { bg: "transparent", marginLeft: "-8px" },
      ios: { bg: "fill.quaternary" },
    },
  },
});

export function BackButton({
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) {
  const platform = useDevice((state) => state.platform);
  const name =
    ariaLabel ?? (typeof children === "string" ? `${children}に戻る` : "戻る");
  return (
    <button
      aria-label={name}
      className={cx(backButtonStyle({ platform }), className)}
      type="button"
      {...props}
    >
      {platform === "android" ? (
        <MaterialSymbol icon={arrowBackSymbol} />
      ) : (
        <ChevronLeft aria-hidden="true" size={24} />
      )}
    </button>
  );
}

// The action at a page's top right: 保存, 作る, 並び替え and the like.
// As iOS 26's bar buttons with words: in a round-ended piece of glass,
// and filled with the accent when it confirms, like 保存 or 追加; gray
// glass while it cannot yet.
const headerActionStyle = cva({
  base: {
    _disabled: {
      bg: "fill.quaternary",
      color: "text.disabled",
      cursor: "default",
    },
    alignItems: "center",
    border: 0,
    borderRadius: "full",
    display: "inline-flex",
    flexShrink: 0,
    height: "touch",
    paddingInline: "16px",
    textStyle: "body",
  },
  defaultVariants: { prominent: false },
  variants: {
    prominent: {
      false: { bg: "fill.quaternary", color: "text.primary" },
      true: { bg: "accent.fill", color: "accent.onFill", fontWeight: 600 },
    },
  },
});

export function HeaderAction({
  prominent = false,
  className,
  ...props
}: ButtonProps & { prominent?: boolean }) {
  return (
    <button
      className={cx(headerActionStyle({ prominent }), className)}
      type="button"
      {...props}
    />
  );
}

// A page's top, as the platforms' navigation bars have it: the way back
// (or キャンセル) on the left, an action on the right, and the large title
// under them. `back` and `onBack` are the usual way back; `leading` takes
// anything else there. `children` go between the bar and the title, like
// a step count.
const pageHeader = {
  bar: css({
    alignItems: "center",
    display: "grid",
    gap: "8px",
    // The ends keep their buttons whole; a long title in the middle gives
    // way, cut short, and stays centered while the ends allow.
    gridTemplateColumns:
      "minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)",
  }),
  // A page with no large title names itself small in the bar's middle,
  // as the platforms' inline titles.
  inlineTitle: css({
    fontWeight: 600,
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textAlign: "center",
    textOverflow: "ellipsis",
    textStyle: "body",
    whiteSpace: "nowrap",
  }),
  trailing: css({ display: "flex", justifyContent: "flex-end" }),
  root: css({ display: "flex", flexDirection: "column", gap: "4px" }),
  // iOS's large title. Android's is a flexible app bar's, in its regular
  // weight: the large one's (displaySmall) on a tab's own page, like 設定,
  // and the medium one's (headlineMedium) on a page pushed over it.
  title: cva({
    base: { margin: 0 },
    variants: {
      size: {
        androidLarge: { fontWeight: 400, textStyle: "largeTitle" },
        androidMedium: { fontWeight: 400, textStyle: "title1" },
        ios: { fontWeight: 600, textStyle: "largeTitle" },
      },
    },
  }),
};

// Android's flexible app bar, which collapses as the page scrolls
// (exitUntilCollapsedScrollBehavior): the bar of the way back and the
// actions stays at the top of what scrolls, the title under it scrolls
// away fading out, and the title comes into the bar, small (titleLarge)
// after the way back, as the bar takes the scrolled container's ground.
// The scroll drives it (ScreenScroll's timeline, --screen-scroll), where
// the browser can.
const COLLAPSES = "@supports (animation-timeline: scroll())";
const appBar = {
  bar: css({
    [COLLAPSES]: {
      animationFillMode: "both",
      animationName: "appBarScrolled",
      animationRange: "40px 64px",
      animationTimeline: "--screen-scroll",
      animationTimingFunction: "linear",
    },
    alignItems: "center",
    bg: "background.base",
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    // Out to the phone's sides, so nothing scrolls past beside it.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    minHeight: "calc(token(sizes.touch) + var(--screen-scroll-top))",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    // Up into the top padding of what scrolls, and stuck at its top.
    marginTop: "calc(-1 * var(--screen-scroll-top))",
    paddingTop: "var(--screen-scroll-top)",
    position: "sticky",
    top: "calc(-1 * var(--screen-scroll-top))",
    zIndex: 1,
  }),
  collapsedTitle: css({
    [COLLAPSES]: {
      animationFillMode: "both",
      animationName: "fadeIn",
      animationRange: "40px 64px",
      animationTimeline: "--screen-scroll",
      animationTimingFunction: "linear",
    },
    fontWeight: 400,
    minWidth: 0,
    opacity: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "title2",
    whiteSpace: "nowrap",
  }),
  // The title and what goes over it, as near the bar as the header's
  // own gap, taking back the scrolling column's.
  expanded: css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginTop: `calc(4px - ${SCREEN_SCROLL_GAP})`,
  }),
  expandedTitle: css({
    [COLLAPSES]: {
      animationFillMode: "both",
      animationName: "fadeOut",
      animationRange: "0px 48px",
      animationTimeline: "--screen-scroll",
      animationTimingFunction: "linear",
    },
  }),
};

export function PageHeader({
  title,
  back,
  onBack,
  leading,
  trailing,
  inlineTitle,
  children,
}: {
  title?: ReactNode;
  back?: string;
  onBack?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  inlineTitle?: ReactNode;
  children?: ReactNode;
}) {
  const platform = useDevice((state) => state.platform);
  const start =
    leading ?? (onBack && <BackButton onClick={onBack}>{back}</BackButton>);
  if (platform === "android" && title) {
    return (
      <>
        <header className={appBar.bar}>
          <div>{start}</div>
          <span aria-hidden="true" className={appBar.collapsedTitle}>
            {title}
          </span>
          <div className={pageHeader.trailing}>{trailing}</div>
        </header>
        <div className={appBar.expanded}>
          {children}
          <h3
            className={cx(
              pageHeader.title({
                size: start ? "androidMedium" : "androidLarge",
              }),
              appBar.expandedTitle
            )}
          >
            {title}
          </h3>
        </div>
      </>
    );
  }
  return (
    <header className={pageHeader.root}>
      {trailing || inlineTitle ? (
        <div className={pageHeader.bar}>
          <div>{start}</div>
          {inlineTitle ? (
            <h3 className={pageHeader.inlineTitle}>{inlineTitle}</h3>
          ) : (
            <span />
          )}
          <div className={pageHeader.trailing}>{trailing}</div>
        </div>
      ) : (
        start
      )}
      {children}
      {title && <h3 className={pageHeader.title({ size: "ios" })}>{title}</h3>}
    </header>
  );
}
