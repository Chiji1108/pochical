import { CalendarDays, Settings2, UsersRound } from "lucide-react";
import { useId } from "react";
import { css, cva, cx } from "styled-system/css";

import { useUser } from "../lib/design-user-store";
import { isMuted } from "./design-group-data";
import { badge } from "./design-group-parts";
import { srOnly } from "./design-ui";

export type Tab = "calendar" | "group" | "settings";

// The app's three tabs, as the platforms' tab bars: an icon over its name,
// the one shown in the accent color.
const tabs: { tab: Tab; label: string; icon: typeof CalendarDays }[] = [
  { icon: CalendarDays, label: "カレンダー", tab: "calendar" },
  { icon: UsersRound, label: "グループ", tab: "group" },
  { icon: Settings2, label: "設定", tab: "settings" },
];
// As iOS 26's: a round-ended bar floating over the screen's foot, held
// off its sides, see-through and blurring what runs under it, the picked
// tab on a round ground of its own. Its words keep a fixed size, as the
// system's tab bars do. The screen leaves room for it: see Screen.
const tabBar = {
  bar: css({
    backdropFilter: "blur(16px) saturate(1.4)",
    bg: "color-mix(in srgb, token(colors.fill.tertiary) 80%, transparent)",
    borderRadius: "full",
    bottom: "var(--tab-bar-bottom)",
    boxShadow: "md",
    color: "text.tertiary",
    display: "flex",
    height: "64px",
    left: "20px",
    padding: "4px",
    position: "absolute",
    right: "20px",
    zIndex: 10,
  }),
  // The unread count on the icon's top right corner, as the platforms'
  // tab bars badge one.
  count: css({ left: "16px", position: "absolute", top: "-6px" }),
  icon: css({ display: "flex", position: "relative" }),
  item: cva({
    base: {
      alignItems: "center",
      bg: "transparent",
      border: 0,
      borderRadius: "full",
      display: "flex",
      flex: 1,
      flexDirection: "column",
      fontSize: "10px",
      fontWeight: 500,
      gap: "4px",
      justifyContent: "center",
    },
    variants: {
      active: {
        true: { bg: "fill.secondary", color: "accent.default" },
      },
    },
  }),
};

// What waits unread behind each tab: the lines in the group chats whose
// notifications are on, and the answers from Pochical's people.
function useUnread(): Record<Tab, number> {
  const chats = useUser((state) => state.chats);
  const groups = useUser((state) => state.groups);
  const support = useUser((state) => state.support.unread);
  let group = 0;
  for (const [key, chat] of Object.entries(chats)) {
    const [groupId = "", chatId = ""] = key.split(":");
    const joined = groups.find((item) => item.id === groupId);
    if (joined && !isMuted(joined, chatId)) {
      group += chat.unread;
    }
  }
  return { calendar: 0, group, settings: support };
}

export function TabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  const unread = useUnread();
  const id = useId();
  return (
    <nav aria-label="タブ" className={tabBar.bar} data-tab-bar="">
      {tabs.map(({ tab, label, icon: Icon }) => (
        <button
          aria-current={active === tab ? "page" : undefined}
          // Named as the tab alone; what waits in it is said after.
          aria-describedby={unread[tab] > 0 ? `${id}-${tab}` : undefined}
          aria-label={label}
          className={tabBar.item({ active: active === tab })}
          key={tab}
          onClick={() => {
            onSelect(tab);
          }}
          type="button"
        >
          <span className={tabBar.icon}>
            <Icon aria-hidden="true" size={24} />
            {unread[tab] > 0 && (
              <span className={cx(badge, tabBar.count)} id={`${id}-${tab}`}>
                {unread[tab]}
                <span className={srOnly}>件の未読</span>
              </span>
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
