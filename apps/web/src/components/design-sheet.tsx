import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";

// Sheet headings, in the two kinds the platforms' own sheets have. A sheet
// to look at has its title and a × to close it. A sheet to decide
// something in has キャンセル, its title and the action, as iOS and Android
// put them. Menus and confirmations keep their own shape, with キャンセル
// at the bottom.

const heading = {
  back: css({
    bg: "transparent",
    border: 0,
    color: "text2",
    display: "grid",
    flexShrink: 0,
    height: "action",
    marginLeft: "-8px",
    placeItems: "center",
    width: "32px",
  }),
  close: css({
    bg: "fill",
    border: 0,
    borderRadius: "50%",
    color: "text2",
    display: "grid",
    flexShrink: 0,
    height: "action",
    placeItems: "center",
    width: "action",
  }),
  eyebrow: css({ color: "text3", fontSize: "12px", margin: "0 0 4px" }),
  root: css({
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "8px",
    marginBottom: "16px",
  }),
  title: css({
    alignItems: "center",
    display: "flex",
    fontSize: "18px",
    fontWeight: 600,
    gap: "6px",
    margin: 0,
  }),
  titleBlock: css({ flex: 1, minWidth: 0 }),
  titleRow: css({ alignItems: "center", display: "flex", gap: "8px" }),
};

const decide = {
  action: css({
    _disabled: { color: "textDisabled", cursor: "default" },
    fontWeight: 600,
    justifySelf: "end",
  }),
  button: css({
    bg: "transparent",
    border: 0,
    color: "accent",
    fontSize: "15px",
    minHeight: "action",
    paddingInline: "4px",
  }),
  cancel: css({ justifySelf: "start" }),
  root: css({
    alignItems: "center",
    display: "grid",
    flexShrink: 0,
    gridTemplateColumns: "1fr auto 1fr",
    marginBottom: "16px",
  }),
  title: css({ fontSize: "16px", fontWeight: 600, margin: 0 }),
};

export function SheetHeading({
  title,
  eyebrow,
  onClose,
  onBack,
  children,
}: {
  title: ReactNode;
  // A small line above the title, like the month it is about.
  eyebrow?: ReactNode;
  onClose: () => void;
  // A step back inside the sheet, when it has more than one.
  onBack?: () => void;
  // Beside the title, like a tag.
  children?: ReactNode;
}) {
  return (
    <header className={heading.root}>
      {onBack && (
        <button
          aria-label="戻る"
          className={heading.back}
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
      )}
      <div className={heading.titleBlock}>
        {eyebrow && <p className={heading.eyebrow}>{eyebrow}</p>}
        <div className={heading.titleRow}>
          <h4 className={heading.title}>{title}</h4>
          {children}
        </div>
      </div>
      <button
        aria-label="閉じる"
        className={heading.close}
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={20} />
      </button>
    </header>
  );
}

export function DecideHeading({
  title,
  action,
  onCancel,
  onAction,
  disabled = false,
}: {
  title: ReactNode;
  action: string;
  onCancel: () => void;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <header className={decide.root}>
      <button
        className={cx(decide.button, decide.cancel)}
        onClick={onCancel}
        type="button"
      >
        キャンセル
      </button>
      <h4 className={decide.title}>{title}</h4>
      <button
        className={cx(decide.button, decide.action)}
        disabled={disabled}
        onClick={onAction}
        type="button"
      >
        {action}
      </button>
    </header>
  );
}
