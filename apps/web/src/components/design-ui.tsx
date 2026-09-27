import { ChevronLeft } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, cx } from "styled-system/css";

// The shared pieces the screens are built from, each the one place its
// look is decided. They map one to one onto the SwiftUI views and Compose
// composables of the native apps; /design/components shows them all.

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

// A button in four strengths: primary for the step to take, quiet beside
// it or for a lesser one, text for a link-like choice, and subtle for
// putting something off. Where it sits, its width in a row or its push to
// the bottom, is the place's to say, through `className`; `ui-button` and
// `ui-button-<variant>` stay on it as hooks for the older styles.
const buttonStyle = cva({
  base: {
    _disabled: { cursor: "default", opacity: 0.4 },
    alignItems: "center",
    border: 0,
    borderRadius: "control",
    cursor: "pointer",
    display: "flex",
    fontSize: "14px",
    fontWeight: 600,
    gap: "8px",
    justifyContent: "center",
  },
  defaultVariants: { variant: "primary" },
  variants: {
    variant: {
      primary: {
        bg: "accentFill",
        color: "onAccentFill",
        minHeight: "control",
        width: "100%",
      },
      quiet: {
        "&:hover:not(:disabled)": { bg: "fill2" },
        bg: "fill",
        color: "accent",
        minHeight: "control",
        width: "100%",
      },
      subtle: {
        alignSelf: "center",
        bg: "transparent",
        color: "text3",
        fontSize: "13px",
        fontWeight: 400,
        margin: "8px auto 0",
        minHeight: "touch",
        paddingInline: "12px",
      },
      text: {
        alignSelf: "center",
        bg: "transparent",
        color: "accent",
        minHeight: "touch",
        paddingInline: "12px",
      },
    },
  },
});

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps & { variant?: "primary" | "quiet" | "text" | "subtle" }) {
  return (
    <button
      className={cx(
        buttonStyle({ variant }),
        `ui-button ui-button-${variant}`,
        className
      )}
      type="button"
      {...props}
    />
  );
}

// An action drawn as its icon alone, like the heading's 招待 or 保存. The
// label is what a screen reader says.
export function IconButton({
  label,
  className,
  ...props
}: ButtonProps & { label: string }) {
  return (
    <button
      aria-label={label}
      className={`ui-icon-button ${className ?? ""}`}
      type="button"
      {...props}
    />
  );
}

// Back to where the page came from, named after it (設定, グループ), or
// キャンセル without the chevron where leaving drops what was entered.
// Without children it is the chevron alone, labelled 戻る.
export function BackButton({
  chevron = true,
  className,
  children,
  ...props
}: ButtonProps & { chevron?: boolean }) {
  return (
    <button
      aria-label={children ? undefined : "戻る"}
      className={`st-back ${className ?? ""}`}
      type="button"
      {...props}
    >
      {chevron && <ChevronLeft aria-hidden="true" size={20} />}
      {children}
    </button>
  );
}

// The action at a page's top right: 保存, 作る, 並び替え and the like.
export function HeaderAction({ className, ...props }: ButtonProps) {
  return (
    <button className={`pe-save ${className ?? ""}`} type="button" {...props} />
  );
}

// A page's top, as the platforms' navigation bars have it: the way back
// (or キャンセル) on the left, an action on the right, and the large title
// under them. `back` and `onBack` are the usual way back; `leading` takes
// anything else there.
export function PageHeader({
  title,
  back,
  onBack,
  leading,
  trailing,
}: {
  title?: ReactNode;
  back?: string;
  onBack?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const start =
    leading ?? (onBack && <BackButton onClick={onBack}>{back}</BackButton>);
  return (
    <header className="st-page-header">
      {trailing ? (
        <div className="pe-topbar">
          {start}
          {trailing}
        </div>
      ) : (
        start
      )}
      {title && <h3 className="st-title">{title}</h3>}
    </header>
  );
}
