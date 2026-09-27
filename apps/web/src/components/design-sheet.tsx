import { Dialog, Portal } from "@ark-ui/react";
import { ChevronLeft, X } from "lucide-react";
import { createContext, useContext, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { css, cva, cx } from "styled-system/css";

// Sheet headings, in the two kinds the platforms' own sheets have. A sheet
// to look at has its title and a × to close it. A sheet to decide
// something in has キャンセル, its title and the action, as iOS and Android
// put them. Menus and confirmations keep their own shape, with キャンセル
// at the bottom.

// The phone a sheet opens in. DesignCalendar gives it; sheets drawn by
// its screens open over that phone rather than over the page.
export const PhoneContext = createContext<RefObject<HTMLElement | null> | null>(
  null
);

const sheet = {
  backdrop: css({
    _closed: { animation: "fadeOut 0.2s ease-in" },
    _open: { animation: "fadeIn 0.25s ease-out" },
    bg: "var(--scrim)",
    inset: 0,
    position: "absolute",
    zIndex: 20,
  }),
  handle: css({
    bg: "controlOff",
    borderRadius: "8px",
    height: "4px",
    margin: "0 auto 20px",
    width: "34px",
  }),
  // The platforms' alert, in the middle, as an app shows after an icon
  // change; it brings its own look through className.
  center: css({
    _closed: { animation: "fadeOut 0.15s ease-in" },
    _open: { animation: "popIn 0.2s ease-out" },
    outline: "none",
  }),
};

// Where the sheet sits: at the bottom, or in the middle for an alert. One
// recipe, so the two never fight over alignItems. A sheet that leaves the
// screen behind it live lets taps through around itself.
const positioner = cva({
  base: { display: "flex", inset: 0, position: "absolute", zIndex: 21 },
  variants: {
    modal: {
      false: { "& > *": { pointerEvents: "auto" }, pointerEvents: "none" },
      true: {},
    },
    placement: {
      bottom: { alignItems: "flex-end" },
      center: { alignItems: "center", justifyContent: "center" },
    },
  },
});

// A sheet over a dimmed ground may take most of the phone. One that
// leaves the screen live stays low, with a shadow in place of the dimming,
// so the part it is about stays in view above it.
const content = cva({
  base: {
    _closed: { animation: "sheetOut 0.2s ease-in" },
    _open: { animation: "sheetIn 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)" },
    bg: "raised",
    borderRadius: "28px 28px 0 0",
    color: "text",
    // A column, so a part marked to scroll can take what is left while the
    // heading stays in reach.
    display: "flex",
    flexDirection: "column",
    outline: "none",
    overflowY: "auto",
    padding: "12px 24px 28px",
    width: "100%",
  },
  variants: {
    modal: {
      false: {
        boxShadow: "0 -6px 24px var(--shadow-strong)",
        maxHeight: "46%",
      },
      true: { maxHeight: "85%" },
    },
  },
});

// The part of a sheet that scrolls under a heading that stays; it runs to
// the sheet's edges so the scrolling reaches them.
export const sheetBody = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  margin: "0 -24px -28px",
  minHeight: 0,
  overflowY: "auto",
  padding: "2px 24px 28px",
});

// A sheet over the phone, as SwiftUI's .sheet and Compose's
// ModalBottomSheet: it rises from the bottom over a dimmed ground, and
// closes by its heading's ×, by the ground, or by Escape. Ark UI's Dialog
// traps focus inside and gives it back when it closes. A sheet that is not
// modal, like a picked day's, leaves the screen behind it undimmed and
// live, and only its × or Escape closes it.
export function Sheet({
  open,
  onOpenChange,
  label,
  role = "dialog",
  placement = "bottom",
  modal = true,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Its name for a screen reader, usually its title.
  label: string;
  // An alertdialog asks something that needs an answer.
  role?: "dialog" | "alertdialog";
  placement?: "bottom" | "center";
  modal?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const phone = useContext(PhoneContext);
  // Focus lands on the sheet itself, as on the platforms, not on its first
  // button with a ring around it.
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root
      closeOnInteractOutside={modal}
      initialFocusEl={() => contentRef.current}
      lazyMount
      modal={modal}
      onOpenChange={(details) => {
        onOpenChange(details.open);
      }}
      open={open}
      preventScroll={false}
      role={role}
      unmountOnExit
    >
      <Portal container={phone ?? undefined}>
        {modal && <Dialog.Backdrop className={sheet.backdrop} />}
        <Dialog.Positioner className={positioner({ modal, placement })}>
          <Dialog.Content
            aria-label={label}
            className={cx(
              placement === "center" ? sheet.center : content({ modal }),
              className
            )}
            ref={contentRef}
          >
            {placement === "bottom" && (
              <div aria-hidden="true" className={sheet.handle} />
            )}
            {children}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

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
