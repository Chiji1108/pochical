import { Check, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import type { ButtonProps } from "./design-ui";

// A screen's top: the way back, its actions, 完了 and 今月.

// 完了 at a screen's top right, for the mode that has to be left on
// purpose: entering shifts, a day opened in the week, an order typed on
// the calendar.
const doneButtonStyle = css({
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
  gap: "8px",
  height: "44px",
  justifyContent: "center",
  padding: "0 20px",
  textStyle: "subheadline",
});

export function DoneButton({ className, ...props }: ButtonProps) {
  return (
    <button className={cx(doneButtonStyle, className)} type="button" {...props}>
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
// The way back, as iOS 26 and Android draw it: an arrow alone, here in
// iOS's round of glass, naming where it goes only to a screen reader.
const backButtonStyle = css({
  _disabled: { visibility: "hidden" },
  alignItems: "center",
  alignSelf: "flex-start",
  bg: "fill.quaternary",
  border: 0,
  borderRadius: "full",
  color: "text.primary",
  display: "inline-flex",
  flexShrink: 0,
  height: "touch",
  justifyContent: "center",
  width: "touch",
});

export function BackButton({
  className,
  children,
  "aria-label": ariaLabel,
  ...props
}: ButtonProps) {
  const name =
    ariaLabel ?? (typeof children === "string" ? `${children}に戻る` : "戻る");
  return (
    <button
      aria-label={name}
      className={cx(backButtonStyle, className)}
      type="button"
      {...props}
    >
      <ChevronLeft aria-hidden="true" size={24} />
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
  title: css({ fontWeight: 600, margin: 0, textStyle: "largeTitle" }),
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
  const start =
    leading ?? (onBack && <BackButton onClick={onBack}>{back}</BackButton>);
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
      {title && <h3 className={pageHeader.title}>{title}</h3>}
    </header>
  );
}
