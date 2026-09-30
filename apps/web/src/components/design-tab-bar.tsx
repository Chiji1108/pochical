import { CalendarDays, Settings2, UsersRound } from "lucide-react";
import { css, cva } from "styled-system/css";

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

export function TabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <nav aria-label="タブ" className={tabBar.bar} data-tab-bar="">
      {tabs.map(({ tab, label, icon: Icon }) => (
        <button
          aria-current={active === tab ? "page" : undefined}
          className={tabBar.item({ active: active === tab })}
          key={tab}
          onClick={() => {
            onSelect(tab);
          }}
          type="button"
        >
          <Icon aria-hidden="true" size={24} />
          {label}
        </button>
      ))}
    </nav>
  );
}
