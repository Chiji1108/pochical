import { Menu } from "@ark-ui/react";
import { Check, ChevronDown } from "lucide-react";
import { useContext, useId } from "react";
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";

import { RowLabelContext } from "./design-list";
import { iconButtonStyle } from "./design-ui";

// Menus: pull-down, an icon's, a picker's, and their items.

// Every menu has iOS 26's look, a pull-down or a message's 返信 and
// コピー alike: the icon or check leading in the text's own color, rows
// apart without lines, a line only between groups, and round corners.
const menu = {
  check: css({ color: "text.primary", flexShrink: 0 }),
  content: css({
    _closed: { animation: "fadeOut 0.12s ease-in" },
    _open: { animation: "fadeIn 0.12s ease-out" },
    bg: "background.elevated",
    border: "1px solid token(colors.border.default)",
    borderRadius: "2xl",
    boxShadow: "lg",
    // A long list, as many shift patterns, scrolls inside the room there
    // is rather than running off the screen.
    maxHeight: "var(--available-height)",
    minWidth: "200px",
    outline: "none",
    overflowY: "auto",
    padding: "8px",
    zIndex: 30,
  }),
  icon: css({ color: "text.primary", display: "flex", flexShrink: 0 }),
  item: css({
    // An action that takes something away, in the danger color with its
    // icon, as iOS draws a destructive item. One class with the rest, so
    // the colors never depend on which class the stylesheet puts last.
    "&[data-danger]": {
      "& > span": { color: "danger.default" },
      color: "danger.default",
    },
    _focusVisible: {
      outline: "2px solid token(colors.accent.default)",
      outlineOffset: "-2px",
    },
    _highlighted: { bg: "fill.tertiary" },
    _hover: { bg: "fill.tertiary" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "lg",
    color: "text.primary",
    cursor: "default",
    display: "flex",
    gap: "12px",
    padding: "12px",
    textAlign: "start",
    textStyle: "body",
    userSelect: "none",
    width: "100%",
  }),
  separator: css({
    border: 0,
    borderTop: "1px solid token(colors.separator)",
    margin: "4px 12px",
  }),
  trigger: css({
    alignItems: "center",
    bg: "fill.tertiary",
    border: 0,
    borderRadius: "lg",
    color: "text.secondary",
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 600,
    gap: "4px",
    padding: "8px 12px 8px 12px",
    textStyle: "subheadline",
  }),
};

// The menu's look, for a menu Ark UI's Menu cannot hold, as a message's
// under its reactions.
export const menuStyle = {
  content: menu.content,
  icon: menu.icon,
  item: menu.item,
  separator: menu.separator,
};

// A pull-down for a page's secondary actions, as SwiftUI's Menu and
// Compose's DropdownMenu: its button names what is chosen now, and the
// choices and actions open under it. Ark UI's Menu moves through them by
// arrow keys and closes on a pick, outside or by Escape. Placed as fixed,
// it opens over what is around it, as a menu does, rather than being cut
// by a list's round corners or a scrolling page it sits in.
export function PullDownMenu({
  label,
  children,
}: {
  // What the button says, usually the current choice.
  label: ReactNode;
  children: ReactNode;
}) {
  const rowLabel = useContext(RowLabelContext);
  const triggerId = useId();
  return (
    <Menu.Root
      ids={{ trigger: triggerId }}
      positioning={{ gutter: 6, placement: "bottom-end", strategy: "fixed" }}
    >
      <Menu.Trigger
        // In a row, the row's label and then the choice (ListRow).
        aria-labelledby={
          rowLabel === undefined ? undefined : `${rowLabel} ${triggerId}`
        }
        className={menu.trigger}
      >
        {label}
        <ChevronDown aria-hidden="true" size={15} />
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content
          className={menu.content}
          // As a row's control the menu sits inside the row's label, and
          // a pick's click would go on to the label, which presses the
          // button again and opens the menu the pick just closed.
          onClick={(event) => {
            event.preventDefault();
          }}
        >
          {children}
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

// The same menu opened from an icon alone, as a toolbar's Menu in SwiftUI
// or an IconButton with a DropdownMenu in Compose. The label is what a
// screen reader says.
export function IconMenu({
  label,
  icon,
  className,
  children,
}: {
  label: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Menu.Root positioning={{ gutter: 6, placement: "bottom-end" }}>
      <Menu.Trigger
        aria-label={label}
        className={cx(iconButtonStyle(), "ui-icon-button", className)}
      >
        {icon}
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content className={menu.content}>{children}</Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

// One choice among several inside a menu, marked with a check, as a
// Picker inside a SwiftUI Menu. An option's icon, as a shift's mark,
// stands after the check. With no option picked, as a blank day's shift,
// `value` is "".
export function MenuPicker<Value extends string>({
  value,
  onValueChange,
  options,
}: {
  value: Value | "";
  onValueChange: (value: Value) => void;
  options: readonly { value: Value; label: string; icon?: ReactNode }[];
}) {
  return (
    <Menu.RadioItemGroup
      onValueChange={(details) => {
        const option = options.find((item) => item.value === details.value);
        if (option) {
          onValueChange(option.value);
        }
      }}
      value={value}
    >
      {options.map((option) => (
        <Menu.RadioItem
          className={menu.item}
          key={option.value}
          value={option.value}
        >
          <Check
            aria-hidden="true"
            className={menu.check}
            size={18}
            visibility={option.value === value ? "visible" : "hidden"}
          />
          {option.icon && <span className={menu.icon}>{option.icon}</span>}
          <Menu.ItemText>{option.label}</Menu.ItemText>
        </Menu.RadioItem>
      ))}
    </Menu.RadioItemGroup>
  );
}

// An action in a menu, with its icon.
export function MenuItem({
  value,
  icon,
  onSelect,
  danger = false,
  children,
}: {
  // Names the item for the menu; not shown.
  value: string;
  icon?: ReactNode;
  onSelect: () => void;
  // Takes something away: in the danger color, as iOS's destructive item.
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Menu.Item
      className={menu.item}
      data-danger={danger ? "" : undefined}
      onSelect={onSelect}
      value={value}
    >
      {icon && <span className={menu.icon}>{icon}</span>}
      {children}
    </Menu.Item>
  );
}

export function MenuSeparator() {
  return <Menu.Separator className={menu.separator} />;
}
