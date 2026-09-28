import { Dialog, Drawer, Portal } from "@ark-ui/react";
import { Check, ChevronLeft, X } from "lucide-react";
import { createContext, useContext, useRef, useState } from "react";
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

// How a let-go sheet settles back into place, as it rises.
const settle = "0.3s cubic-bezier(0.2, 0.8, 0.2, 1)";

const sheet = {
  // The strip along the sheet's top that holds the handle: taller than the
  // handle so it is easy to take hold of, and it starts a swipe even over
  // a part that scrolls.
  grabber: css({
    flexShrink: 0,
    margin: "-12px -24px 0",
    padding: "12px 24px 20px",
  }),
  handle: css({
    bg: "controlOff",
    borderRadius: "8px",
    height: "4px",
    margin: "0 auto",
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

// The dimming under a sheet; an alert's goes over any sheet already open.
// A sheet's lightens as it is swiped down, and closes from there.
const backdrop = cva({
  base: {
    _open: { animation: "fadeIn 0.25s ease-out" },
    bg: "var(--scrim)",
    inset: 0,
    position: "absolute",
    zIndex: 20,
  },
  variants: {
    placement: {
      bottom: {
        "&[data-swiping]": { transition: "none" },
        _closed: { animation: "scrimOut 0.2s ease-in" },
        opacity: "calc(1 - var(--drawer-swipe-progress, 0))",
        transition: `opacity ${settle}`,
      },
      center: { _closed: { animation: "fadeOut 0.2s ease-in" }, zIndex: 40 },
    },
  },
});

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
      // Alerts sit above any sheet, as they may ask over one.
      center: { alignItems: "center", justifyContent: "center", zIndex: 41 },
    },
  },
});

// A sheet over a dimmed ground may take most of the phone. One that
// leaves the screen live stays low, with a shadow in place of the dimming,
// so the part it is about stays in view above it.
const content = cva({
  base: {
    // Let go far or fast enough, it carries on down at the pace it had
    // rather than setting off again.
    _closed: {
      "&[data-swiping]": { animationTimingFunction: "ease-out" },
      animation: "sheetOut 0.2s ease-in",
    },
    _open: { animation: "sheetIn 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)" },
    bg: "raised",
    // Floating off the screen's sides and foot, as iOS 26's sheets.
    borderRadius: "32px",
    color: "text",
    // A column, so a part marked to scroll can take what is left while the
    // heading stays in reach.
    display: "flex",
    flexDirection: "column",
    outline: "none",
    overflowY: "auto",
    margin: "0 8px 8px",
    padding: "12px 24px 28px",
    // Back into place when a swipe lets go short; while the finger is on
    // it, Ark UI turns this off so the sheet follows it.
    transition: `transform ${settle}`,
    width: "calc(100% - 16px)",
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

// A sheet drawn in place rather than opened, for pictures of one: the flow
// diagrams' sheet standing open over a phone, where a dialog would open
// over the whole page instead of the small frame, and the samples on
// /design/components. It has the open sheet's look.
const picture = {
  // Over the phone's screen, inside its bezel, and kept below the page's
  // own layers.
  over: css({
    borderRadius: "46px",
    inset: "6px",
    isolation: "isolate",
    overflow: "hidden",
    position: "absolute",
  }),
};

export function SheetPicture({
  over = false,
  handle = true,
  children,
}: {
  over?: boolean;
  handle?: boolean;
  children: ReactNode;
}) {
  // Alone it has round corners all around and its whole height. The
  // styles are merged rather than joined: two classes for one property
  // would leave the winner to the stylesheet's order.
  const look = over
    ? content({ modal: true })
    : css(content.raw({ modal: true }), {
        borderRadius: "20px",
        maxHeight: "none",
      });
  const drawn = (
    <section className={look}>
      {handle && (
        <div aria-hidden="true" className={sheet.grabber}>
          <div className={sheet.handle} />
        </div>
      )}
      {children}
    </section>
  );
  if (!over) {
    return drawn;
  }
  return (
    <div className={picture.over}>
      <div className={backdrop({ placement: "bottom" })} />
      <div className={positioner({ modal: true, placement: "bottom" })}>
        {drawn}
      </div>
    </div>
  );
}

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
// closes by its heading's ×, by the ground, by Escape, or by swiping it
// down. Ark UI's Drawer traps focus inside and gives it back when it
// closes, and leaves a part that scrolls to scroll until it is at its top.
// A sheet that is not modal, like a picked day's, leaves the screen behind
// it undimmed and live, and only its ×, Escape or a swipe closes it. An
// alert in the middle is a Dialog, and does not swipe away.
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
  const root = {
    closeOnInteractOutside: modal,
    initialFocusEl: () => contentRef.current,
    lazyMount: true,
    modal,
    onOpenChange: (details: { open: boolean }) => {
      onOpenChange(details.open);
    },
    open,
    preventScroll: false,
    role,
    unmountOnExit: true,
  };
  if (placement === "center") {
    return (
      <Dialog.Root {...root}>
        <Portal container={phone ?? undefined}>
          {modal && <Dialog.Backdrop className={backdrop({ placement })} />}
          <Dialog.Positioner className={positioner({ modal, placement })}>
            <Dialog.Content
              aria-label={label}
              className={cx(sheet.center, className)}
              ref={contentRef}
            >
              {children}
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    );
  }
  return (
    <Drawer.Root {...root}>
      <Portal container={phone ?? undefined}>
        {modal && <Drawer.Backdrop className={backdrop({ placement })} />}
        <Drawer.Positioner className={positioner({ modal, placement })}>
          <Drawer.Content
            aria-label={label}
            className={cx(content({ modal }), className)}
            ref={contentRef}
          >
            <Drawer.Grabber aria-hidden="true" className={sheet.grabber}>
              <Drawer.GrabberIndicator className={sheet.handle} />
            </Drawer.Grabber>
            {children}
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
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
    height: "touch",
    placeItems: "center",
    width: "touch",
  }),
  eyebrow: css({ color: "text3", margin: "0 0 4px", textStyle: "footnote" }),
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
    fontWeight: 600,
    gap: "8px",
    margin: 0,
    textStyle: "title3",
  }),
  titleBlock: css({ flex: 1, minWidth: 0 }),
  titleRow: css({ alignItems: "center", display: "flex", gap: "8px" }),
};

// As iOS 26's sheets: ✕ in gray glass on the left, ✓ on the right filled
// with the accent once it can confirm, and the title between them.
const decide = {
  button: cva({
    base: {
      border: 0,
      borderRadius: "999px",
      display: "grid",
      height: "touch",
      placeItems: "center",
      width: "touch",
    },
    variants: {
      confirm: {
        false: { bg: "fill", color: "text", justifySelf: "start" },
        true: {
          _disabled: { bg: "fill", color: "textDisabled", cursor: "default" },
          bg: "accentFill",
          color: "onAccentFill",
          justifySelf: "end",
        },
      },
    },
  }),
  root: css({
    alignItems: "center",
    display: "grid",
    flexShrink: 0,
    gridTemplateColumns: "1fr auto 1fr",
    marginBottom: "16px",
  }),
  title: css({ fontWeight: 600, margin: 0, textStyle: "headline" }),
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
        aria-label="キャンセル"
        className={decide.button({ confirm: false })}
        onClick={onCancel}
        type="button"
      >
        <X aria-hidden="true" size={22} />
      </button>
      <h4 className={decide.title}>{title}</h4>
      <button
        aria-label={action}
        className={decide.button({ confirm: true })}
        disabled={disabled}
        onClick={onAction}
        type="button"
      >
        <Check aria-hidden="true" size={22} />
      </button>
    </header>
  );
}

// How far a photo is pulled down before letting go closes it.
const dismissDistance = 120;

const viewer = {
  backdrop: css({
    _closed: { animation: "fadeOut 0.2s ease-in" },
    _open: { animation: "fadeIn 0.2s ease-out" },
    bg: "black",
    inset: 0,
    position: "absolute",
    zIndex: 30,
  }),
  close: css({
    bg: "rgba(255, 255, 255, 0.16)",
    border: 0,
    borderRadius: "50%",
    color: "white",
    display: "grid",
    height: "action",
    placeItems: "center",
    position: "absolute",
    right: "16px",
    top: "56px",
    width: "action",
    zIndex: 1,
  }),
  content: css({
    _closed: { animation: "fadeOut 0.2s ease-in" },
    _open: { animation: "popIn 0.2s ease-out" },
    alignItems: "center",
    display: "flex",
    height: "100%",
    justifyContent: "center",
    outline: "none",
    touchAction: "none",
    width: "100%",
  }),
  photo: css({
    aspectRatio: "1",
    objectFit: "cover",
    userSelect: "none",
    width: "100%",
  }),
  positioner: css({ inset: 0, position: "absolute", zIndex: 31 }),
};

// A photo on its own over black, as the platforms show a profile picture
// tapped to look at it: × or a pull downward closes it, and the ground
// fades as the photo is pulled.
export function PhotoViewer({
  photo,
  label,
  open,
  onOpenChange,
}: {
  photo: string;
  // Its name for a screen reader, like whose picture it is.
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useContext(PhoneContext);
  const [pull, setPull] = useState<{ from: number; by: number }>();
  const by = Math.max(pull?.by ?? 0, 0);
  return (
    <Dialog.Root
      lazyMount
      onOpenChange={(details) => {
        onOpenChange(details.open);
      }}
      open={open}
      preventScroll={false}
      unmountOnExit
    >
      <Portal container={phone ?? undefined}>
        <Dialog.Backdrop
          className={viewer.backdrop}
          style={{ opacity: 1 - (by / dismissDistance) * 0.5 }}
        />
        <Dialog.Positioner className={viewer.positioner}>
          <Dialog.Content
            aria-label={label}
            className={viewer.content}
            onPointerCancel={() => {
              setPull(undefined);
            }}
            onPointerDown={(event) => {
              setPull({ by: 0, from: event.clientY });
            }}
            onPointerMove={(event) => {
              if (pull) {
                setPull({ ...pull, by: event.clientY - pull.from });
              }
            }}
            onPointerUp={() => {
              setPull(undefined);
              if (by > dismissDistance) {
                onOpenChange(false);
              }
            }}
          >
            <Dialog.CloseTrigger aria-label="閉じる" className={viewer.close}>
              <X aria-hidden="true" size={20} />
            </Dialog.CloseTrigger>
            <img
              alt=""
              className={viewer.photo}
              draggable={false}
              src={photo}
              style={{
                transform: `translateY(${by}px)`,
                transition: pull ? "none" : "transform 0.2s ease-out",
              }}
            />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

const confirm = {
  // Side by side, or stacked with the action on top when a label is too
  // long to share the row, as both platforms stack them.
  actions: css({
    display: "flex",
    flexWrap: "wrap-reverse",
    gap: "8px",
    marginTop: "20px",
  }),
  button: css({
    border: 0,
    borderRadius: "12px",
    // Equal halves, but never narrower than the label.
    flex: "1 1 0",
    minWidth: "max-content",
    textStyle: "headline",
    fontWeight: 600,
    minHeight: "touch",
    paddingInline: "16px",
    whiteSpace: "nowrap",
  }),
  // The badge red holds white text in dark mode too; --danger is a light
  // red there, made for text.
  action: css({ bg: "var(--badge)", color: "var(--on-badge)" }),
  cancel: css({ bg: "fill", color: "text" }),
  message: css({
    color: "text3",
    lineHeight: 1.6,
    margin: "8px 0 0",
    textStyle: "subheadline",
  }),
  root: css({
    bg: "raised",
    borderRadius: "20px",
    color: "text",
    padding: "24px 20px 16px",
    textAlign: "center",
    width: "min(300px, calc(100% - 48px))",
  }),
  title: css({ fontWeight: 700, margin: 0, textStyle: "headline" }),
};

// A question before something hard to undo, in the middle of the phone as
// iOS's alert and Android's AlertDialog ask it, over a page or over a sheet
// alike. It opens as soon as it is rendered; dismissing it is キャンセル.
export function ConfirmDialog({
  title,
  message,
  action,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet
      className={confirm.root}
      label={title}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open
      placement="center"
      role="alertdialog"
    >
      <h4 className={confirm.title}>{title}</h4>
      <p className={confirm.message}>{message}</p>
      <div className={confirm.actions}>
        <button
          className={cx(confirm.button, confirm.cancel)}
          onClick={onCancel}
          type="button"
        >
          キャンセル
        </button>
        <button
          className={cx(confirm.button, confirm.action)}
          onClick={onConfirm}
          type="button"
        >
          {action}
        </button>
      </div>
    </Sheet>
  );
}
