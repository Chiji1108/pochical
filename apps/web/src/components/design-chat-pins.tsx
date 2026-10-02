import { Popover, Portal } from "@ark-ui/react";
import { ChevronDown, ChevronUp, Pin, PinOff } from "lucide-react";
import { useContext, useState } from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { useLongPress } from "./design-chat-actions";
import { summaryOf } from "./design-chat-summary";
import type { Message } from "./design-group-data";
import { PhoneContext } from "./design-sheet";
import { IconButton, menuStyle } from "./design-ui";

// The lines pinned over a chat (spec/chat.md, Pins): the bar under the
// header, and the list of all of them under it.

const pinBar = {
  // Under the header, the latest pinned line, as LINE shows its
  // announcement: the pin, whose words, and a tap jumps to it.
  bar: css({
    alignItems: "center",
    borderBottom: "1px solid token(colors.separator)",
    display: "flex",
    gap: "4px",
    // Out to the screen's edges, so its line runs from edge to edge as a
    // bar's does on iOS and Android (a list's lines stay inset); its
    // contents stay where they were.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    paddingBottom: "4px",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "4px",
  }),
  jump: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "md",
    color: "text.primary",
    display: "flex",
    flex: 1,
    gap: "12px",
    minWidth: 0,
    padding: "8px",
    textAlign: "left",
    // A long press offers ピン留めを外す, not the phone's own callout.
    userSelect: "none",
    WebkitTouchCallout: "none",
    width: "100%",
  }),
  icon: css({ color: "accent.default", flexShrink: 0 }),
  words: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minWidth: 0,
  }),
  label: css({
    color: "accent.default",
    fontWeight: 600,
    textStyle: "caption",
  }),
  text: css({
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
  // All of them, opened from ▾ under the bar.
  list: css({
    borderBottom: "1px solid token(colors.separator)",
    listStyle: "none",
    marginBottom: 0,
    // Out to the screen's edges, so its line runs from edge to edge as a
    // bar's does on iOS and Android (a list's lines stay inset); its
    // contents stay where they were.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    marginTop: 0,
    paddingBottom: "4px",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "4px",
  }),
};

// The pinned lines over a chat: the latest, and with more than one, ▾
// opening them all, each a tap away from its place in the chat.
// A pinned line in the bar or its list: a tap goes to it, and a long
// press (or a right click) offers ピン留めを外す, as a message's long press
// opens its menu. No × in sight: taking a pin off takes it off for
// everyone, so it is not left a stray tap away.
function PinItem({
  label,
  onJump,
  onUnpin,
  children,
}: {
  // For a screen reader: what the pin is.
  label: string;
  onJump: () => void;
  onUnpin: () => void;
  children: ReactNode;
}) {
  const phone = useContext(PhoneContext);
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => {
    setOpen(true);
  });
  return (
    <Popover.Root
      lazyMount
      onOpenChange={(details) => {
        setOpen(details.open);
      }}
      open={open}
      positioning={{ gutter: 4, placement: "bottom-start" }}
      unmountOnExit
    >
      <Popover.Anchor asChild>
        <button
          aria-label={`${label}。押すとメッセージへ、長押しでピン留めを外す`}
          className={pinBar.jump}
          onClick={() => {
            if (!press.consumeLongPress()) {
              onJump();
            }
          }}
          type="button"
          {...press.handlers}
        >
          {children}
        </button>
      </Popover.Anchor>
      <Portal container={phone ?? undefined}>
        <Popover.Positioner>
          <Popover.Content aria-label="ピン留め" className={menuStyle.content}>
            <button
              className={menuStyle.item}
              onClick={() => {
                setOpen(false);
                onUnpin();
              }}
              type="button"
            >
              <span className={menuStyle.icon}>
                <PinOff aria-hidden="true" size={18} />
              </span>
              ピン留めを外す
            </button>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

export function PinBar({
  pins,
  nameOf,
  open,
  onOpenChange,
  onJump,
  onUnpin,
}: {
  pins: Message[];
  nameOf: (id: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump: (id: string) => void;
  onUnpin: (id: string) => void;
}) {
  const [latest] = pins;
  if (!latest) {
    return null;
  }
  const many = pins.length > 1;
  return (
    <>
      <div className={pinBar.bar}>
        <PinItem
          label={`ピン留め：${summaryOf(latest, nameOf)}`}
          onJump={() => {
            onJump(latest.id);
          }}
          onUnpin={() => {
            onUnpin(latest.id);
          }}
        >
          <Pin aria-hidden="true" className={pinBar.icon} size={18} />
          <span className={pinBar.words}>
            <span className={pinBar.label}>
              {many ? `ピン留め・${pins.length}件` : "ピン留め"}
            </span>
            <span className={pinBar.text}>{summaryOf(latest, nameOf)}</span>
          </span>
        </PinItem>
        {many && (
          <IconButton
            aria-expanded={open}
            glass={false}
            label={open ? "ピン留めを閉じる" : "ピン留めをすべて表示"}
            onClick={() => {
              onOpenChange(!open);
            }}
          >
            {open ? (
              <ChevronUp aria-hidden="true" size={20} />
            ) : (
              <ChevronDown aria-hidden="true" size={20} />
            )}
          </IconButton>
        )}
      </div>
      {many && open && (
        <ul aria-label="ピン留め" className={pinBar.list}>
          {pins.map((line) => (
            <li key={line.id}>
              <PinItem
                label={`${nameOf(line.from)}：${summaryOf(line, nameOf)}`}
                onJump={() => {
                  onJump(line.id);
                }}
                onUnpin={() => {
                  onUnpin(line.id);
                }}
              >
                <span className={pinBar.words}>
                  <span className={pinBar.label}>{nameOf(line.from)}</span>
                  <span className={pinBar.text}>{summaryOf(line, nameOf)}</span>
                </span>
              </PinItem>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
