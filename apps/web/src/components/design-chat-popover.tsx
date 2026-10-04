import { Popover, Portal } from "@ark-ui/react";
import type { PopoverRootProps } from "@ark-ui/react";
import { useContext } from "react";
import type { ReactElement, ReactNode } from "react";
import { css } from "styled-system/css";

import { chatAvatarSize } from "./design-chat-style";
import type { Member } from "./design-group-data";
import { Avatar } from "./design-group-parts";
import { menuStyle } from "./design-menu";
import { PhoneContext } from "./design-sheet";

// The small popovers a chat opens from a line, a pin or a reaction: a
// link's 開く and コピー, ピン留めを外す, and who chose a reaction or a
// poll's day. Each opens over the phone in the menu's look, as the
// message's own menu does.

// A popover over the phone, in the menu's look. Ark UI's Popover places
// it, moves focus in, and closes it by a tap elsewhere or Escape; it
// mounts only while open.
export function PhonePopover({
  label,
  open,
  onOpenChange,
  positioning,
  anchor,
  trigger,
  children,
}: {
  // What a screen reader calls it.
  label: string;
  // Left out, it opens and closes itself, from its trigger.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  positioning: PopoverRootProps["positioning"];
  // What it opens under: an anchor, which opens it in its own way (a long
  // press), or a trigger, which opens it with a tap. Neither when the
  // place is given in `positioning`, as a link in a message's words is.
  anchor?: ReactElement;
  trigger?: ReactElement;
  children: ReactNode;
}) {
  const phone = useContext(PhoneContext);
  return (
    <Popover.Root
      lazyMount
      onOpenChange={(details) => {
        onOpenChange?.(details.open);
      }}
      open={open}
      positioning={positioning}
      unmountOnExit
    >
      {anchor && <Popover.Anchor asChild>{anchor}</Popover.Anchor>}
      {trigger && <Popover.Trigger asChild>{trigger}</Popover.Trigger>}
      <Portal container={phone ?? undefined}>
        <Popover.Positioner>
          <Popover.Content aria-label={label} className={menuStyle.content}>
            {children}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

// An action in a popover or a message's menu, drawn as a menu's item: Ark
// UI's MenuItem needs a Menu around it, which a popover is not.
export function PopoverMenuItem({
  icon,
  onClick,
  danger = false,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  // Takes something away: in the danger color, as iOS's destructive item.
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={menuStyle.item}
      data-danger={danger ? "" : undefined}
      onClick={onClick}
      type="button"
    >
      <span className={menuStyle.icon}>{icon}</span>
      {children}
    </button>
  );
}

const peopleList = {
  list: css({ listStyle: "none", margin: 0, padding: 0 }),
  person: css({
    alignItems: "center",
    display: "flex",
    gap: "12px",
    padding: "8px 12px",
    textStyle: "body",
  }),
};

// Everyone who chose something, a reaction or a poll's day, each with
// their face and name, where the faces in sight stop at a few.
export function PeopleList({ people }: { people: Member[] }) {
  return (
    <ul className={peopleList.list}>
      {people.map((person) => (
        <li className={peopleList.person} key={person.id}>
          <Avatar member={person} size={chatAvatarSize} />
          {person.name}
        </li>
      ))}
    </ul>
  );
}
