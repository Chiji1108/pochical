import { Popover, Portal } from "@ark-ui/react";
import {
  CalendarCheck,
  Copy,
  Download,
  ExternalLink,
  Flag,
  Link,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  Undo2,
} from "lucide-react";
import { useContext, useRef } from "react";
import type { MouseEvent, ReactElement } from "react";
import { css, cx } from "styled-system/css";

import { reactionChoices } from "./design-group-data";
import { PhoneContext } from "./design-sheet";
import { ToastContext } from "./design-toast";
import { menuStyle } from "./design-ui";

// What a long press (or a right click) on a chat's line opens: its
// reactions and menu, or a link's own small menu, and the press itself.

// What a line's long press offers, and how it opens.
export type LineActions = Omit<
  Parameters<typeof MessageActions>[0],
  "children" | "onSave"
>;

// The member a tap in a message's words was on, if it was a mention.
export function mentionAt(target: EventTarget) {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-mention]")?.dataset.mention
    : undefined;
}

// A link long pressed: its address and the words that show it, which its
// menu opens under.
export type LinkMenuAt = { url: string; element: HTMLElement };

export function linkElementAt(
  target: EventTarget | null
): LinkMenuAt | undefined {
  const element =
    target instanceof Element
      ? target.closest<HTMLElement>("[data-link]")
      : null;
  const url = element?.dataset.link;
  return element && url ? { element, url } : undefined;
}

// 開く and コピー for a link long pressed in a message, under the link.
export function LinkMenu({
  at,
  onClose,
  onOpen,
}: {
  at?: LinkMenuAt;
  onClose: () => void;
  onOpen: (url: string) => void;
}) {
  const phone = useContext(PhoneContext);
  const toast = useContext(ToastContext);
  return (
    <Popover.Root
      lazyMount
      onOpenChange={(details) => {
        if (!details.open) {
          onClose();
        }
      }}
      open={at !== undefined}
      positioning={{
        getAnchorElement: () => at?.element ?? null,
        gutter: 4,
        placement: "bottom-start",
      }}
      unmountOnExit
    >
      <Portal container={phone ?? undefined}>
        <Popover.Positioner>
          <Popover.Content aria-label="リンク" className={menuStyle.content}>
            <button
              className={menuStyle.item}
              onClick={() => {
                if (at) {
                  onOpen(at.url);
                }
                onClose();
              }}
              type="button"
            >
              <span className={menuStyle.icon}>
                <ExternalLink aria-hidden="true" size={18} />
              </span>
              リンクを開く
            </button>
            <button
              className={menuStyle.item}
              onClick={() => {
                const url = at?.url ?? "";
                onClose();
                navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    toast("コピーしました");
                  })
                  .catch(() => {
                    toast("コピーできませんでした", "problem");
                  });
              }}
              type="button"
            >
              <span className={menuStyle.icon}>
                <Link aria-hidden="true" size={18} />
              </span>
              リンクをコピー
            </button>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

// The link under a tap in a message's words, if it was on one.
export function linkAt(target: EventTarget) {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-link]")?.dataset.link
    : undefined;
}

// The apps open a link in the system's browser sheet (SFSafariViewController,
// Custom Tabs), over the chat; the prototype opens a tab.
export function openLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export const messageActions = {
  // Holds the message without a box of its own, so the layout is the
  // message's; a long press there offers no text to select.
  anchor: css({
    WebkitTouchCallout: "none",
    display: "contents",
    userSelect: "none",
  }),
  // The message the actions are for stays bright above the dimming.
  lifted: css({ position: "relative", zIndex: 25 }),
  scrim: css({
    animation: "fadeIn 0.2s ease-out",
    bg: "scrim",
    inset: 0,
    position: "absolute",
    zIndex: 20,
  }),
  // The reactions and the menu, a little apart, as the platforms' context
  // menus put them: nothing drawn around the two.
  content: css({
    _closed: { animation: "fadeOut 0.12s ease-in" },
    _open: { animation: "popIn 0.15s ease-out" },
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    outline: "none",
    zIndex: 30,
  }),
  more: css({ color: "text.secondary" }),
  reaction: css({
    _focusVisible: { outline: "2px solid token(colors.accent.default)" },
    _hover: { bg: "fill.tertiary" },
    bg: "transparent",
    border: 0,
    borderRadius: "circle",
    display: "grid",
    height: "34px",
    padding: 0,
    placeItems: "center",
    textStyle: "title2",
    width: "34px",
  }),
  reactions: css({
    alignItems: "center",
    bg: "background.elevated",
    border: "1px solid token(colors.border.default)",
    borderRadius: "full",
    boxShadow: "md",
    display: "flex",
    gap: "2px",
    padding: "4px",
  }),
  // Your own messages sit on the right, and so do their actions.
  end: css({ alignItems: "flex-end" }),
  start: css({ alignItems: "flex-start" }),
};

// Reactions, and a little apart the menu: 返信, コピー, ピン留め, and 編集
// and 送信取消 for yours or 通報 for others', as the platforms' context
// menus on a message in LINE and iMessage (a link's own 開く and コピー
// are on the link's long press, see LinkMenu): the rest of
// the screen dims while the message stays bright. Ark UI's
// Popover opens it from the message, moves focus in, and closes it by a
// tap elsewhere or Escape.
export function MessageActions({
  open,
  onOpenChange,
  mine,
  text,
  onReact,
  onMore,
  onReply,
  onSave,
  onEdit,
  onUnsend,
  onReport,
  onPin,
  onRedecide,
  pinned = false,
  onPressAt,
  keyboardOpens = true,
  disabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mine: boolean;
  // Opens every emoji, for a reaction beyond the ones offered.
  onMore: () => void;
  // What コピー copies; shared days have none.
  text?: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  // 保存, for a photo.
  onSave?: () => void;
  // 編集, for your own message's words; 送信取消, for any of yours.
  onEdit?: () => void;
  onUnsend?: () => void;
  // 通報, for someone else's message.
  onReport?: () => void;
  // ピン留め, or ピン留めを外す when it is pinned.
  onPin?: () => void;
  // 決め直す, for a settled poll, to whoever settles it.
  onRedecide?: () => void;
  pinned?: boolean;
  // A long press on part of the message that has its own menu, like a
  // link in its words: open that and return true, and these stay shut.
  onPressAt?: (target: EventTarget | null) => boolean;
  // Enter or Space on the message opens these, as the long press does,
  // unless its own press does something, like a photo opening large.
  keyboardOpens?: boolean;
  // Not yet, like a photo still going up.
  disabled?: boolean;
  // The message itself, a button that opens this.
  children: ReactElement;
}) {
  const phone = useContext(PhoneContext);
  const toast = useContext(ToastContext);
  // Focus lands on the whole, as in a sheet, not on 👍 with a ring.
  const contentRef = useRef<HTMLDivElement>(null);
  // The message itself, whatever element it is.
  const messageRef = useRef<HTMLElement>(null);
  const setMessage = (element: HTMLElement | null) => {
    messageRef.current = element;
  };
  // An action that opens something else (the composer, an alert) waits
  // until the menu has gone: closing, the menu hands focus back to the
  // message, which would take it from the composer or close the alert.
  const after = useRef<() => void>(undefined);
  // Where the press began, for a part with its own menu (onPressAt).
  const pressed = useRef<EventTarget | null>(null);
  const press = useLongPress(() => {
    if (disabled || onPressAt?.(pressed.current) === true) {
      return;
    }
    onOpenChange(true);
  });
  const closeThen = (action: () => void) => {
    after.current = action;
    onOpenChange(false);
  };
  const copy = async (value: string) => {
    onOpenChange(false);
    try {
      await navigator.clipboard.writeText(value);
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした", "problem");
    }
  };
  return (
    <Popover.Root
      initialFocusEl={() => contentRef.current}
      lazyMount
      onExitComplete={() => {
        after.current?.();
        after.current = undefined;
      }}
      onOpenChange={(details) => {
        onOpenChange(details.open);
      }}
      open={open}
      positioning={{
        // Under the whole bubble, past a link's page in it too; else under
        // the message itself (its holder takes no room of its own).
        getAnchorElement: () =>
          messageRef.current?.closest<HTMLElement>("[data-part=bubble]") ??
          (messageRef.current?.firstElementChild as HTMLElement | null) ??
          null,
        gutter: 8,
        placement: mine ? "bottom-end" : "bottom-start",
      }}
      unmountOnExit
    >
      <Popover.Anchor asChild ref={setMessage}>
        {/* Holds the message and hears its press: a long press (or a
            right click) opens these, as LINE and iMessage do, and the
            click it ends with is swallowed here, before the message's own
            (a link, a mention) can act on it. A tap is the message's own:
            a link or a mention opens, a photo opens large, else nothing,
            so scrolling past a line never opens its menu by accident. */}
        <span
          className={messageActions.anchor}
          onClickCapture={(event) => {
            if (press.consumeLongPress()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            // A click with no pointer is Enter or Space.
            if (keyboardOpens && event.detail === 0 && !disabled) {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(true);
            }
          }}
          onPointerDownCapture={(event) => {
            pressed.current = event.target;
          }}
          {...press.handlers}
        >
          {children}
        </span>
      </Popover.Anchor>
      <Portal container={phone ?? undefined}>
        {/* Everything but the message dims, so it is clear which one the
            actions are for; a tap on it closes them. */}
        {open && <div aria-hidden="true" className={messageActions.scrim} />}
        <Popover.Positioner>
          <Popover.Content
            aria-label="リアクションとメニュー"
            ref={contentRef}
            className={cx(
              messageActions.content,
              mine ? messageActions.end : messageActions.start
            )}
          >
            <div className={messageActions.reactions}>
              {reactionChoices.map((emoji) => (
                <button
                  aria-label={`${emoji}でリアクション`}
                  className={messageActions.reaction}
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                  }}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
              <button
                aria-label="ほかの絵文字でリアクション"
                className={cx(messageActions.reaction, messageActions.more)}
                onClick={onMore}
                type="button"
              >
                <Plus aria-hidden="true" size={18} />
              </button>
            </div>
            <div className={menuStyle.content}>
              <button
                className={menuStyle.item}
                onClick={onReply}
                type="button"
              >
                <span className={menuStyle.icon}>
                  <Reply aria-hidden="true" size={18} />
                </span>
                返信
              </button>
              {text && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    copy(text).catch(() => undefined);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Copy aria-hidden="true" size={18} />
                  </span>
                  コピー
                </button>
              )}
              {onSave && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    onOpenChange(false);
                    onSave();
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Download aria-hidden="true" size={18} />
                  </span>
                  保存
                </button>
              )}
              {onPin && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    onOpenChange(false);
                    onPin();
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    {pinned ? (
                      <PinOff aria-hidden="true" size={18} />
                    ) : (
                      <Pin aria-hidden="true" size={18} />
                    )}
                  </span>
                  {pinned ? "ピン留めを外す" : "ピン留め"}
                </button>
              )}
              {onRedecide && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    closeThen(onRedecide);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <CalendarCheck aria-hidden="true" size={18} />
                  </span>
                  決め直す
                </button>
              )}
              {onEdit && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    closeThen(onEdit);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Pencil aria-hidden="true" size={18} />
                  </span>
                  編集
                </button>
              )}
              {/* Apart from the rest, in red, as iOS sets off an action
                  that takes something away. */}
              {onUnsend && (
                <>
                  <hr className={menuStyle.separator} />
                  <button
                    className={menuStyle.item}
                    data-danger=""
                    onClick={() => {
                      closeThen(onUnsend);
                    }}
                    type="button"
                  >
                    <span className={menuStyle.icon}>
                      <Undo2 aria-hidden="true" size={18} />
                    </span>
                    送信取消
                  </button>
                </>
              )}
              {onReport && (
                <>
                  <hr className={menuStyle.separator} />
                  <button
                    className={menuStyle.item}
                    data-danger=""
                    onClick={() => {
                      closeThen(onReport);
                    }}
                    type="button"
                  >
                    <span className={menuStyle.icon}>
                      <Flag aria-hidden="true" size={18} />
                    </span>
                    通報
                  </button>
                </>
              )}
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

// Held this long, a press counts as a long press.
const longPressMs = 500;

// A long press on the web, which has no event for one: a timer from the
// finger going down, dropped when it lifts, leaves or turns into a
// scroll; a right click (and Android's own long press) opens it too. The
// click that follows a long press is swallowed by `consumeLongPress`.
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number>(undefined);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
  };
  const fire = () => {
    cancel();
    fired.current = true;
    onLongPress();
  };
  return {
    consumeLongPress: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
    handlers: {
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault();
        fire();
      },
      onPointerCancel: cancel,
      onPointerDown: () => {
        fired.current = false;
        cancel();
        timer.current = window.setTimeout(fire, longPressMs);
      },
      onPointerLeave: cancel,
      onPointerUp: cancel,
    },
  };
}
