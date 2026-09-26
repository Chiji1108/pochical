import {
  CalendarPlus,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Info,
  MessagesSquare,
  Plus,
  QrCode,
  Reply,
  ScanLine,
  Send,
  SendHorizontal,
  Settings2,
  UserPlus,
  X,
} from "lucide-react";
import { useContext, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  addDays,
  dateKey,
  formatDay,
  holidayName,
  monthDates,
  patterns,
  TabBar,
  timeRange,
  weekDates,
  weekendClassName,
} from "./design-calendar";
import type { Schedule, Shift, Tab } from "./design-calendar";
import { iconNames } from "./design-look-editor";
import { ThemeContext, themeOfColor } from "./design-theme";
import type { ColorChoice } from "./design-theme";
import {
  guessLook,
  IconWeightContext,
  lookOf,
  MarkGlyph,
  MonochromeContext,
  useDisplayColor,
  useMarkColor,
  useMarkColors,
  markIcons,
  nextColor,
  ShiftMarkStyleContext,
  sampleLooks,
} from "./shift-mark";
import type { Look, LookSettings, MarkIcon } from "./shift-mark";

// A pattern as another member set it up. Their looks come with them, and
// each viewer sees them in their own style.
type MemberPattern = {
  id: string;
  name: string;
  time?: string;
  off: boolean;
  look: Look;
};

type Member = {
  id: string;
  name: string;
  me?: boolean;
  // The style they picked for their own calendar: its shape and カラー show
  // to everyone as they chose them. マルチカラー when no color is given.
  style?: { look: LookSettings; color?: ColorChoice };
  // A profile picture; without one the avatar shows the first letter.
  photo?: string;
  patterns: MemberPattern[];
  shiftOn: (date: Date) => string | undefined;
};

type Group = {
  id: string;
  name: string;
  mark: GroupMark;
  // How you appear in this group, when it differs from your usual profile.
  mine?: GroupProfile;
  members: Member[];
};

// `noPhoto` hides the usual picture in this group without choosing another.
type GroupProfile = { name?: string; photo?: string; noPhoto?: boolean };

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
const designMonth = new Date(2026, 8, 1);
const designToday = new Date(2026, 8, 24);
const weekLength = 7;

function pattern(
  id: string,
  name: string,
  look: Partial<Look> & Pick<Look, "icon" | "emoji" | "color">,
  extra: { time?: string; off?: boolean } = {}
): MemberPattern {
  return {
    id,
    look: {
      color: look.color,
      emoji: look.emoji,
      icon: look.icon,
      symbol: look.symbol ?? name.slice(0, 1),
    },
    name,
    off: extra.off ?? false,
    time: extra.time,
  };
}

const restPattern = pattern(
  "off",
  "休み",
  { color: 0, emoji: "🌿", icon: "leaf" },
  { off: true }
);

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

// Sample profile pictures: Unsplash photos served by picsum.photos.
export function samplePhoto(id: number) {
  return `https://picsum.photos/id/${id}/192/192`;
}

export type Profile = { name: string; photo?: string };

// Days from a fixed Sunday, for members whose shifts go round in order.
function dayNumber(date: Date) {
  const base = Date.UTC(2026, 0, 4);
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day - base) / 86_400_000);
}

const partner: Member = {
  id: "yuki",
  name: "ゆうき",
  patterns: [
    pattern(
      "office",
      "出勤",
      { color: 9, emoji: "💼", icon: "briefcase" },
      { time: "9:00 – 18:00" }
    ),
    pattern(
      "home",
      "在宅",
      { color: 10, emoji: "🏠", icon: "house" },
      { time: "9:00 – 18:00" }
    ),
    restPattern,
  ],
  photo: samplePhoto(1005),
  shiftOn: (date) => {
    if (isWeekend(date) || holidayName(date)) {
      return "off";
    }
    return date.getDay() === 3 ? "home" : "office";
  },
  style: { look: presetLook("pop") },
};

const mother: Member = {
  id: "mother",
  name: "お母さん",
  patterns: [
    pattern(
      "part",
      "パート",
      { color: 2, emoji: "🛒", icon: "shoppingBag" },
      { time: "10:00 – 15:00" }
    ),
    restPattern,
  ],
  photo: samplePhoto(429),
  shiftOn: (date) =>
    [1, 3, 5].includes(date.getDay()) && !holidayName(date) ? "part" : "off",
  style: { look: presetLook("roster") },
};

const nurseOrder = ["day", "day", "night", "after", "off", "off"] as const;

// Built on first use: this file and the calendar import each other, so
// the calendar's patterns are not ready while this module loads.
const misaki = (): Member => ({
  id: "misaki",
  name: "みさき",
  patterns: (["day", "night", "after", "off"] as Shift[]).map((key) => ({
    id: key,
    look: lookOf(key),
    name: patterns[key].label,
    off: key === "off",
    time: timeRange({ shift: key }),
  })),
  photo: samplePhoto(823),
  shiftOn: (date) => nurseOrder[(dayNumber(date) + 3) % nurseOrder.length],
  style: { color: "sumi", look: presetLook("minimal") },
});

// あや made レッスン herself and never picked a look, so it has what the
// name alone gives it.
const aya = (): Member => ({
  id: "aya",
  name: "あや",
  patterns: [
    pattern(
      "early",
      "早番",
      { color: 1, emoji: "🌤️", icon: "cloudSun" },
      { time: "7:00 – 16:00" }
    ),
    pattern(
      "late",
      "遅番",
      { color: 5, emoji: "🌇", icon: "sunset" },
      { time: "13:00 – 22:00" }
    ),
    pattern("lesson", "レッスン", { ...guessLook("レッスン"), color: 6 }),
    restPattern,
  ],
  shiftOn: (date) => {
    const order = ["early", "early", "late", "late", "off", "lesson", "off"];
    return order[(dayNumber(date) + 3) % order.length];
  },
  style: { look: presetLook("friendly") },
});

// Nurses from the same year, each on the same order at a different point.
const classmates = (): Member[] =>
  [
    ["haruka", "はるか", 0, 1025, "natural"],
    ["ren", "れん", 1, 237, "pop"],
    ["mei", "めい", 2, 0, "roster"],
    ["sota", "そうた", 4, 669, "minimal"],
    ["yui", "ゆい", 5, 1062, "friendly"],
  ].map(([id, name, offset, photo, preset]) => ({
    ...misaki(),
    id: String(id),
    name: String(name),
    photo: photo ? samplePhoto(Number(photo)) : undefined,
    shiftOn: (date: Date) =>
      nurseOrder[(dayNumber(date) + Number(offset)) % nurseOrder.length],
    style: { look: presetLook(String(preset)) },
  }));

// Old school friends in all kinds of work: a group too wide for 日ごと.
const schoolFriends = (): Member[] => [
  ...[
    ["kana", "かな", 0, 1027, "natural"],
    ["riku", "りく", 2, 1074, "minimal"],
  ].map(([id, name, offset, photo, preset]) => ({
    ...misaki(),
    id: String(id),
    name: String(name),
    photo: samplePhoto(Number(photo)),
    shiftOn: (date: Date) =>
      nurseOrder[(dayNumber(date) + Number(offset)) % nurseOrder.length],
    style: { look: presetLook(String(preset)) },
  })),
  ...[
    ["shun", "しゅん", 1012, "pop"],
    ["nana", "なな", 0, "minimal"],
    ["taichi", "たいち", 1084, "roster"],
  ].map(([id, name, photo, preset]) => ({
    ...partner,
    id: String(id),
    name: String(name),
    photo: photo ? samplePhoto(Number(photo)) : undefined,
    style: { look: presetLook(String(preset)) },
  })),
  ...[
    ["mio", "みお", 1, 64],
    ["kaito", "かいと", 4, 0],
  ].map(([id, name, offset, photo]) => ({
    ...aya(),
    id: String(id),
    name: String(name),
    photo: photo ? samplePhoto(Number(photo)) : undefined,
    shiftOn: (date: Date) => {
      const order = ["early", "early", "late", "late", "off", "lesson", "off"];
      return order[(dayNumber(date) + Number(offset)) % order.length];
    },
  })),
  {
    ...mother,
    id: "sakiko",
    name: "さきこ",
    photo: samplePhoto(1080),
    style: { look: presetLook("friendly") },
  },
];

function meFrom(
  schedule: Schedule,
  patternKeys: Shift[],
  photo?: string
): Member {
  return {
    id: "me",
    me: true,
    name: "自分",
    patterns: patternKeys.map((key) => ({
      id: key,
      look: lookOf(key),
      name: patterns[key].label,
      off: key === "off" || key === "paid",
      time: timeRange({ shift: key }),
    })),
    photo,
    shiftOn: (date) => schedule[dateKey(date)]?.shift,
  };
}

function patternOn(member: Member, date: Date) {
  const id = member.shiftOn(date);
  return member.patterns.find((item) => item.id === id);
}

// Everyone has a pattern that counts as a day off. An unfilled day does
// not count, since nobody knows yet.
function everyoneOff(members: Member[], date: Date) {
  return members.every((member) => patternOn(member, date)?.off === true);
}

function sameMonth(date: Date, month: Date) {
  return date.getMonth() === month.getMonth();
}

// A chat line. `days` shares dates, drawn with everyone's shifts;
// `replyTo` quotes an earlier line.
type Message = {
  id: string;
  from: string;
  when: string;
  time: string;
  text?: string;
  days?: Date[];
  replyTo?: string;
  reactions?: Reaction[];
};

type Reaction = { emoji: string; by: string[] };

type Chat = { messages: Message[]; unread: number };

const groupChat = "group";

const reactionChoices = ["👍", "❤️", "😂", "😮", "🙏", "🎉"];

const sampleChats: Record<string, Chat> = {
  "family:group": {
    messages: [
      {
        from: "mother",
        id: "f1",
        reactions: [{ by: ["yuki"], emoji: "👍" }],
        text: "来週の日曜、みんな休みみたいだからご飯行かない？",
        time: "19:02",
        when: "昨日",
      },
      {
        from: "yuki",
        id: "f2",
        text: "いいね！焼肉がいいな",
        time: "19:10",
        when: "昨日",
      },
      {
        days: [new Date(2026, 8, 27)],
        from: "me",
        id: "f3",
        reactions: [{ by: ["mother", "yuki"], emoji: "🎉" }],
        time: "8:15",
        when: "今日",
      },
      {
        from: "me",
        id: "f4",
        replyTo: "f1",
        text: "27日ならいけるよ！前の日が明けじゃないから元気なはず",
        time: "8:15",
        when: "今日",
      },
      {
        from: "mother",
        id: "f5",
        reactions: [
          { by: ["me"], emoji: "🙏" },
          { by: ["yuki"], emoji: "❤️" },
        ],
        text: "じゃあお店予約しとくね",
        time: "9:40",
        when: "今日",
      },
      {
        from: "yuki",
        id: "f6",
        replyTo: "f5",
        text: "何時にする？",
        time: "9:52",
        when: "今日",
      },
      {
        from: "mother",
        id: "f7",
        replyTo: "f6",
        text: "18時でどう？焼肉にしたよ",
        time: "10:03",
        when: "今日",
      },
    ],
    unread: 2,
  },
  "family:yuki": {
    messages: [
      {
        from: "yuki",
        id: "y1",
        text: "明日って夜勤だっけ？",
        time: "22:31",
        when: "昨日",
      },
      {
        from: "me",
        id: "y2",
        reactions: [{ by: ["yuki"], emoji: "❤️" }],
        replyTo: "y1",
        text: "ううん、明日は休み。夜ごはん作るね",
        time: "22:40",
        when: "昨日",
      },
    ],
    unread: 0,
  },
  "friends:group": {
    messages: [
      {
        days: [new Date(2026, 8, 14), new Date(2026, 8, 21)],
        from: "misaki",
        id: "n1",
        time: "12:05",
        when: "今日",
      },
      {
        from: "misaki",
        id: "n2",
        reactions: [{ by: ["aya", "me"], emoji: "😮" }],
        text: "14日と21日、みんな休みじゃん！",
        time: "12:05",
        when: "今日",
      },
      {
        from: "aya",
        id: "n3",
        replyTo: "n2",
        text: "21日カフェ行こ〜。14日はレッスンの後ならいける",
        time: "12:20",
        when: "今日",
      },
      {
        from: "misaki",
        id: "n4",
        reactions: [{ by: ["aya"], emoji: "👍" }],
        replyTo: "n3",
        text: "21日にしよ！",
        time: "12:24",
        when: "今日",
      },
    ],
    unread: 3,
  },
  "friends:misaki": {
    messages: [
      {
        from: "misaki",
        id: "m1",
        text: "来月の希望休、もう出した？",
        time: "18:12",
        when: "月曜",
      },
    ],
    unread: 0,
  },
};

function chatTitle(group: Group, chatId: string) {
  if (chatId === groupChat) {
    return "全体チャット";
  }
  return group.members.find((member) => member.id === chatId)?.name ?? "";
}

function chatKey(groupId: string, chatId: string) {
  return `${groupId}:${chatId}`;
}

type Page =
  | { name: "hub" }
  // `from` is the chat that opened it, to go back there.
  | { name: "shifts"; month?: Date; day?: Date; from?: string }
  | { name: "chat"; chatId: string }
  | { name: "invite" }
  | { name: "new" }
  | { name: "settings" };

export function DesignGroup({
  schedule,
  patternKeys,
  profile,
  onTab,
}: {
  schedule: Schedule;
  patternKeys: Shift[];
  profile: Profile;
  onTab: (tab: Tab) => void;
}) {
  const [groups, setGroups] = useState<Omit<Group, "members">[]>([
    {
      id: "family",
      name: "家族",
      // The family dog, as the family group's picture.
      mark: { kind: "photo", photo: samplePhoto(237) },
    },
    {
      id: "friends",
      mark: { emoji: "🌷", kind: "emoji" },
      name: "看護学校の友達",
    },
    {
      id: "ward",
      name: "3階東病棟 2024年入職の同期",
      // At work she goes by her family name and keeps her photo private.
      mine: { name: "佐藤", noPhoto: true },
      mark: { color: 10, icon: "hospital", kind: "icon" },
    },
    {
      id: "school",
      mark: { color: 3, kind: "letter", text: "高" },
      name: "高校の同級生",
    },
  ]);
  const [groupId, setGroupId] = useState("family");
  const [chats, setChats] = useState(sampleChats);
  // The table layout each group was last seen in.
  const [layouts, setLayouts] = useState<Record<string, Layout>>({});
  const [page, setPage] = useState<Page>({ name: "hub" });
  const meIn = (id: string) => {
    const found = groups.find((item) => item.id === id);
    const shown = found ? profileIn(found, profile) : profile;
    return meFrom(schedule, patternKeys, shown.photo);
  };
  const membersOf = (id: string): Member[] => {
    const me = meIn(id);
    if (id === "family") {
      return [me, partner, mother];
    }
    if (id === "friends") {
      return [me, misaki(), aya()];
    }
    if (id === "ward") {
      return [me, ...classmates()];
    }
    if (id === "school") {
      return [me, ...schoolFriends()];
    }
    return [me];
  };
  const summary = groups.find((item) => item.id === groupId) ?? groups[0];
  const group: Group = { ...summary, members: membersOf(summary.id) };
  const chatOf = (id: string, chatId: string): Chat =>
    chats[chatKey(id, chatId)] ?? { messages: [], unread: 0 };
  const unreadOf = (id: string) =>
    Object.entries(chats)
      .filter(([key]) => key.startsWith(`${id}:`))
      .reduce((total, [, chat]) => total + chat.unread, 0);

  if (page.name === "chat") {
    const key = chatKey(group.id, page.chatId);
    return (
      <ChatPage
        chat={chatOf(group.id, page.chatId)}
        group={group}
        onBack={() => {
          setPage({ name: "hub" });
        }}
        onChange={(messages) => {
          setChats({ ...chats, [key]: { messages, unread: 0 } });
        }}
        onOpenDay={(date) => {
          setPage({
            from: page.chatId,
            month: new Date(date.getFullYear(), date.getMonth(), 1),
            name: "shifts",
          });
        }}
        people={
          page.chatId === groupChat
            ? group.members
            : group.members.filter(
                (member) => member.me || member.id === page.chatId
              )
        }
        title={chatTitle(group, page.chatId)}
      />
    );
  }

  return (
    <div className="dc-content st-screen">
      {page.name === "hub" ? (
        <div className="gr-layout">
          <GroupRail
            groups={groups}
            onNew={() => {
              setPage({ name: "new" });
            }}
            onSelect={setGroupId}
            selected={group.id}
            unreadOf={unreadOf}
          />
          <div className="st-scroll gr-hub">
            <GroupHub
              chatOf={(chatId) => chatOf(group.id, chatId)}
              group={group}
              onChat={(chatId) => {
                setChats({
                  ...chats,
                  [chatKey(group.id, chatId)]: {
                    ...chatOf(group.id, chatId),
                    unread: 0,
                  },
                });
                setPage({ chatId, name: "chat" });
              }}
              onInvite={() => {
                setPage({ name: "invite" });
              }}
              onSettings={() => {
                setPage({ name: "settings" });
              }}
              onShifts={() => {
                setPage({ name: "shifts" });
              }}
              onShiftsDay={(date) => {
                setPage({
                  day: date,
                  month: new Date(date.getFullYear(), date.getMonth(), 1),
                  name: "shifts",
                });
              }}
            />
          </div>
        </div>
      ) : (
        <div className="st-scroll">
          {page.name === "shifts" && (
            <ShiftsPage
              backLabel={page.from ? chatTitle(group, page.from) : group.name}
              group={group}
              layout={layouts[group.id] ?? defaultLayout(group.members.length)}
              day={page.day}
              month={page.month}
              onBack={() => {
                setPage(
                  page.from
                    ? { chatId: page.from, name: "chat" }
                    : { name: "hub" }
                );
              }}
              onLayout={(layout) => {
                setLayouts({ ...layouts, [group.id]: layout });
              }}
            />
          )}
          {page.name === "settings" && (
            <GroupSettingsPage
              group={group}
              onBack={() => {
                setPage({ name: "hub" });
              }}
              onChange={(mine) => {
                setGroups(
                  groups.map((item) =>
                    item.id === group.id ? { ...item, mine } : item
                  )
                );
              }}
              onInvite={() => {
                setPage({ name: "invite" });
              }}
              onMark={(mark) => {
                setGroups(
                  groups.map((item) =>
                    item.id === group.id ? { ...item, mark } : item
                  )
                );
              }}
              profile={profile}
            />
          )}
          {page.name === "invite" && (
            <InvitePage
              group={group}
              onBack={() => {
                setPage({ name: "hub" });
              }}
            />
          )}
          {page.name === "new" && (
            <NewGroupPage
              onBack={() => {
                setPage({ name: "hub" });
              }}
              onCreate={({ myName, ...created }) => {
                const id = `group-${groups.length}`;
                const mine =
                  myName === profile.name ? undefined : { name: myName };
                setGroups([...groups, { ...created, id, mine }]);
                setGroupId(id);
                setPage({ name: "invite" });
              }}
              profile={profile}
              usedColors={groups.map((item) => colorOfMark(item.mark))}
            />
          )}
        </div>
      )}
      {page.name === "hub" && <TabBar active="group" onSelect={onTab} />}
    </div>
  );
}

// Groups down the side, like chat apps with many rooms. The count is
// unread messages across the group's chats.
function GroupRail({
  groups,
  selected,
  unreadOf,
  onSelect,
  onNew,
}: {
  groups: Omit<Group, "members">[];
  selected: string;
  unreadOf: (id: string) => number;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <nav aria-label="グループ" className="gr-rail">
      {groups.map((group) => {
        const unread = unreadOf(group.id);
        return (
          <button
            aria-current={group.id === selected ? "page" : undefined}
            aria-label={`${group.name}${unread > 0 ? `、未読${unread}件` : ""}`}
            className="gr-rail-item"
            key={group.id}
            onClick={() => {
              onSelect(group.id);
            }}
            type="button"
          >
            <span aria-hidden="true" className="gr-rail-icon">
              <GroupIcon mark={group.mark} size={24} />
            </span>
            {unread > 0 && (
              <span aria-hidden="true" className="gr-badge gr-rail-badge">
                {unread}
              </span>
            )}
          </button>
        );
      })}
      <span aria-hidden="true" className="gr-rail-divider" />
      <button
        aria-label="グループを作る"
        className="gr-rail-action"
        onClick={onNew}
        type="button"
      >
        <Plus aria-hidden="true" size={20} />
      </button>
      <button
        aria-label="QRコードで参加"
        className="gr-rail-action"
        type="button"
      >
        <ScanLine aria-hidden="true" size={19} />
      </button>
    </nav>
  );
}

// The group at a glance: this week for everyone, then its chats.
function GroupHub({
  group,
  chatOf,
  onShifts,
  onShiftsDay,
  onChat,
  onInvite,
  onSettings,
}: {
  group: Group;
  chatOf: (chatId: string) => Chat;
  onShifts: () => void;
  // Opens the month with that day picked, as if pressed in the table.
  onShiftsDay: (date: Date) => void;
  onChat: (chatId: string) => void;
  onInvite: () => void;
  onSettings: () => void;
}) {
  const week = weekDates(designToday);
  const nextOff = Array.from({ length: 60 }, (_, index) =>
    addDays(designToday, index)
  ).find(
    (date) => group.members.length > 1 && everyoneOff(group.members, date)
  );
  const others = group.members.filter((member) => !member.me);
  return (
    <>
      <header className="gr-hub-header">
        <h3>
          <span aria-hidden="true" className="gr-hub-icon">
            <GroupIcon mark={group.mark} size={16} />
          </span>
          <span className="gr-hub-name">{group.name}</span>
        </h3>
        <button
          aria-label="メンバーを招待"
          className="gr-icon-button"
          onClick={onInvite}
          type="button"
        >
          <UserPlus aria-hidden="true" size={18} />
        </button>
        <button
          aria-label="グループの設定"
          className="gr-icon-button"
          onClick={onSettings}
          type="button"
        >
          <Settings2 aria-hidden="true" size={18} />
        </button>
      </header>
      <section className="st-section">
        <div className="gr-section-head">
          <h4>シフト</h4>
          <button className="gr-section-link" onClick={onShifts} type="button">
            月で見る
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
        <div className="gr-week-card">
          <button
            aria-label="今週のみんなのシフト。押すと月で見られます"
            className="gr-week-card-table"
            onClick={onShifts}
            type="button"
          >
            <MemberTable
              compact
              dates={week}
              group={group}
              month={designToday}
            />
          </button>
          {nextOff ? (
            <button
              className="gr-week-card-next"
              onClick={() => {
                onShiftsDay(nextOff);
              }}
              type="button"
            >
              <span className="gr-week-card-next-label">次にみんな休み</span>
              <span className="gr-week-card-next-value">
                {formatDay(nextOff)}・{daysFromToday(nextOff)}
              </span>
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          ) : (
            <div className="gr-week-card-next">
              <span className="gr-week-card-next-label">次にみんな休み</span>
              <span className="gr-week-card-next-value">なし</span>
            </div>
          )}
        </div>
      </section>
      <section className="st-section">
        <h4>チャット</h4>
        <div className="st-list">
          <ChatRow
            chat={chatOf(groupChat)}
            icon={
              <span className="gr-chat-all">
                <MessagesSquare aria-hidden="true" size={15} />
              </span>
            }
            label="全体チャット"
            members={group.members}
            onOpen={() => {
              onChat(groupChat);
            }}
          />
          {others.map((member) => (
            <ChatRow
              chat={chatOf(member.id)}
              icon={<Avatar member={member} size={28} />}
              key={member.id}
              label={member.name}
              members={group.members}
              onOpen={() => {
                onChat(member.id);
              }}
            />
          ))}
        </div>
        {others.length === 0 && (
          <p className="st-note">メンバーを招待すると、1対1でも話せます。</p>
        )}
      </section>
    </>
  );
}

function lastLine(chat: Chat, members: Member[]) {
  const last = chat.messages.at(-1);
  if (!last) {
    return;
  }
  const who = members.find((member) => member.id === last.from);
  const text = last.days ? `${summaryOf(last)}を共有しました` : last.text;
  return who?.me ? `自分：${text}` : text;
}

function ChatRow({
  label,
  icon,
  chat,
  members,
  onOpen,
}: {
  label: string;
  icon: ReactNode;
  chat: Chat;
  members: Member[];
  onOpen: () => void;
}) {
  const preview = lastLine(chat, members);
  const last = chat.messages.at(-1);
  return (
    <button className="st-row gr-chat-row" onClick={onOpen} type="button">
      {icon}
      <span className="gr-chat-row-text">
        <span className="gr-chat-row-name">{label}</span>
        <small className="gr-chat-row-preview">
          {preview ?? "まだメッセージはありません"}
        </small>
      </span>
      <span className="gr-chat-row-meta">
        {last && <small className="gr-chat-row-time">{last.time}</small>}
        {chat.unread > 0 && (
          <span className="gr-badge" role="status">
            {chat.unread}
            <span className="dc-sr-only">件の未読</span>
          </span>
        )}
      </span>
    </button>
  );
}

function ChatPage({
  title,
  group,
  people,
  chat,
  onBack,
  onChange,
  onOpenDay,
}: {
  title: string;
  group: Group;
  // Who a shared day shows: everyone, or the two people in a direct chat.
  people: Member[];
  chat: Chat;
  onBack: () => void;
  onChange: (messages: Message[]) => void;
  onOpenDay: (date: Date) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sharing, setSharing] = useState(false);
  // The line whose actions are open, and the one being answered.
  const [selected, setSelected] = useState<string>();
  const [replyTo, setReplyTo] = useState<string>();
  const [flash, setFlash] = useState<string>();
  // A tap anywhere but the open actions or its message closes them.
  useEffect(() => {
    if (!selected) {
      return;
    }
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".gr-actions, .gr-message-tap")) {
        setSelected(undefined);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
    };
  }, [selected]);
  const isGroup = title === "全体チャット";
  const byId = (id?: string) =>
    chat.messages.find((message) => message.id === id);
  const nameOf = (id: string) =>
    group.members.find((member) => member.id === id)?.name ?? "";
  const post = (message: Omit<Message, "id" | "from" | "when" | "time">) => {
    onChange([
      ...chat.messages,
      {
        ...message,
        from: "me",
        id: `sent-${chat.messages.length}`,
        replyTo,
        time: "10:10",
        when: "今日",
      },
    ]);
    setReplyTo(undefined);
  };
  const send = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    post({ text });
    setDraft("");
  };
  const react = (id: string, emoji: string) => {
    onChange(
      chat.messages.map((message) =>
        message.id === id ? toggleReaction(message, emoji) : message
      )
    );
    setSelected(undefined);
  };
  const jumpTo = (id: string) => {
    document
      .getElementById(`message-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => {
      setFlash(undefined);
    }, flashMilliseconds);
  };
  const toggleSelected = (id: string) => {
    setSelected(selected === id ? undefined : id);
  };
  const replying = byId(replyTo);
  return (
    <div className="dc-content st-screen gr-chat">
      <header className="gr-chat-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          {group.name}
        </button>
        <h3>{title}</h3>
      </header>
      <ol aria-label={`${title}のメッセージ`} className="gr-messages">
        {chat.messages.length === 0 && (
          <li className="gr-messages-empty">まだメッセージはありません</li>
        )}
        {chat.messages.map((message, index) => {
          const previous = chat.messages[index - 1];
          const member = group.members.find((item) => item.id === message.from);
          const mine = member?.me === true;
          const firstOfRun =
            previous?.from !== message.from || message.replyTo !== undefined;
          const quoted = byId(message.replyTo);
          return (
            <li
              className={`gr-message-item ${flash === message.id ? "gr-flash" : ""}`}
              id={`message-${message.id}`}
              key={message.id}
            >
              {previous?.when !== message.when && (
                <span className="gr-when">{message.when}</span>
              )}
              <span className={`gr-message ${mine ? "gr-mine" : ""}`}>
                {!mine && (
                  <span className="gr-message-avatar">
                    {firstOfRun && member && (
                      <Avatar member={member} size={chatAvatarSize} />
                    )}
                  </span>
                )}
                <span className="gr-message-body">
                  {!mine && isGroup && firstOfRun && (
                    <small className="gr-message-name">{member?.name}</small>
                  )}
                  <span className="gr-bubble-row">
                    {message.days ? (
                      <button
                        aria-expanded={selected === message.id}
                        aria-label={`${member?.name ?? ""}が共有した日にち。押すとリアクションと返信`}
                        className="gr-message-tap"
                        onClick={() => {
                          toggleSelected(message.id);
                        }}
                        type="button"
                      >
                        <DayCard days={message.days} members={people} />
                      </button>
                    ) : (
                      // Like the app: the quoted line sits inside the bubble,
                      // above a thin rule, and jumps to the original.
                      <span className="gr-bubble">
                        {quoted && (
                          <button
                            aria-label={`${nameOf(quoted.from)}への返信。返信元を表示`}
                            className="gr-bubble-quote"
                            onClick={() => {
                              jumpTo(quoted.id);
                            }}
                            type="button"
                          >
                            <span className="gr-bubble-quote-name">
                              {nameOf(quoted.from)}
                            </span>
                            <span className="gr-bubble-quote-text">
                              {summaryOf(quoted)}
                            </span>
                            <span
                              aria-hidden="true"
                              className="gr-bubble-rule"
                            />
                          </button>
                        )}
                        <button
                          aria-expanded={selected === message.id}
                          aria-label={`${member?.name ?? ""}のメッセージ：${message.text ?? ""}。押すとリアクションと返信`}
                          className="gr-message-tap gr-bubble-text"
                          onClick={() => {
                            toggleSelected(message.id);
                          }}
                          type="button"
                        >
                          {message.text}
                        </button>
                      </span>
                    )}
                    <small className="gr-message-time">{message.time}</small>
                  </span>
                  {message.days && (
                    <button
                      className="gr-day-open"
                      onClick={() => message.days && onOpenDay(message.days[0])}
                      type="button"
                    >
                      シフト表で見る
                    </button>
                  )}
                  {message.reactions && message.reactions.length > 0 && (
                    <span className="gr-reactions">
                      {message.reactions.map((reaction) => (
                        <button
                          aria-label={`${reaction.emoji} ${reaction.by.map(nameOf).join("、")}`}
                          aria-pressed={reaction.by.includes("me")}
                          className="gr-reaction"
                          key={reaction.emoji}
                          onClick={() => {
                            react(message.id, reaction.emoji);
                          }}
                          type="button"
                        >
                          {reaction.emoji}
                          <small className="gr-reaction-count">
                            {reaction.by.length}
                          </small>
                        </button>
                      ))}
                    </span>
                  )}
                  {selected === message.id && (
                    <span className="gr-actions">
                      {reactionChoices.map((emoji) => (
                        <button
                          aria-label={`${emoji}でリアクション`}
                          key={emoji}
                          onClick={() => {
                            react(message.id, emoji);
                          }}
                          type="button"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        className="gr-actions-reply"
                        onClick={() => {
                          setReplyTo(message.id);
                          setSelected(undefined);
                        }}
                        type="button"
                      >
                        <Reply aria-hidden="true" size={15} />
                        返信
                      </button>
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {replying && (
        <div className="gr-replying">
          <span className="gr-quote gr-replying-quote">
            <span className="gr-quote-name">{nameOf(replying.from)}に返信</span>
            <span className="gr-quote-text">{summaryOf(replying)}</span>
          </span>
          <button
            aria-label="返信をやめる"
            className="gr-icon-button"
            onClick={() => {
              setReplyTo(undefined);
            }}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}
      <form
        className="gr-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <button
          aria-label="日にちを共有"
          className="gr-composer-day"
          onClick={() => {
            setSharing(true);
          }}
          type="button"
        >
          <CalendarPlus aria-hidden="true" size={20} />
        </button>
        <input
          aria-label="メッセージ"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="メッセージ"
          value={draft}
        />
        <button
          aria-label="送る"
          className="gr-composer-send"
          disabled={draft.trim() === ""}
          type="submit"
        >
          <SendHorizontal aria-hidden="true" size={18} />
        </button>
      </form>
      {sharing && (
        <DaySheet
          members={people}
          onClose={() => {
            setSharing(false);
          }}
          onShare={(days) => {
            post({ days });
            setSharing(false);
          }}
        />
      )}
    </div>
  );
}

const flashMilliseconds = 1200;

function summaryOf(message: Message) {
  const [first] = message.days ?? [];
  if (first) {
    const more = (message.days?.length ?? 0) > 1 ? "ほか" : "";
    return `📅 ${formatDay(first)}${more}`;
  }
  return message.text ?? "";
}

// Adds your reaction, or takes it back if it was already yours.
function toggleReaction(message: Message, emoji: string): Message {
  const reactions = message.reactions ?? [];
  const existing = reactions.find((reaction) => reaction.emoji === emoji);
  if (!existing) {
    return { ...message, reactions: [...reactions, { by: ["me"], emoji }] };
  }
  const mine = existing.by.includes("me");
  const by = mine
    ? existing.by.filter((id) => id !== "me")
    : [...existing.by, "me"];
  return {
    ...message,
    reactions: reactions
      .map((reaction) => (reaction.emoji === emoji ? { by, emoji } : reaction))
      .filter((reaction) => reaction.by.length > 0),
  };
}

// Shared dates with each person's shift. One day spreads out; several
// become a small table, a row per day.
function DayCard({ days, members }: { days: Date[]; members: Member[] }) {
  const [first] = days;
  if (days.length === 1 && first) {
    const together = everyoneOff(members, first);
    return (
      <span className="gr-day-card">
        <span className="gr-day-card-head">
          {formatDay(first)}
          {together && <span className="gr-day-card-tag">みんな休み</span>}
        </span>
        <span className="gr-day-card-people">
          {members.map((member) => (
            <span className="gr-day-card-person" key={member.id}>
              <Avatar member={member} />
              <Mark date={first} member={member} size={16} />
              <small>{patternOn(member, first)?.name ?? "未入力"}</small>
            </span>
          ))}
        </span>
      </span>
    );
  }
  const columns = {
    gridTemplateColumns: `44px repeat(${members.length}, 26px)`,
  };
  return (
    <span className="gr-day-card gr-day-card-many">
      <span className="gr-day-card-row gr-day-card-names" style={columns}>
        <span />
        {members.map((member) => (
          <span key={member.id}>
            <Avatar member={member} />
            <span className="dc-sr-only">{member.name}</span>
          </span>
        ))}
      </span>
      {days.map((date) => (
        <span
          className={`gr-day-card-row ${everyoneOff(members, date) ? "gr-together-cell" : ""}`}
          key={dateKey(date)}
          style={columns}
        >
          <span
            className={`gr-day-card-date gr-date ${weekendClassName(date)}`}
          >
            {date.getMonth() + 1}/{date.getDate()}
            <small className="gr-small-weekday">
              {weekdayLabels[date.getDay()]}
            </small>
          </span>
          {members.map((member) => (
            <span
              className={`gr-day-card-cell ${patternOn(member, date)?.off ? "gr-off-cell" : ""}`}
              key={member.id}
            >
              <Mark date={date} member={member} size={15} />
              <span className="dc-sr-only">
                {member.name}：{patternOn(member, date)?.name ?? "未入力"}
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

// Picking days to share: days everyone is off first, then any day on a
// small calendar. Several can be picked at once.
function DaySheet({
  members,
  onClose,
  onShare,
}: {
  members: Member[];
  onClose: () => void;
  onShare: (days: Date[]) => void;
}) {
  const [month, setMonth] = useState(
    new Date(designToday.getFullYear(), designToday.getMonth(), 1)
  );
  const [picked, setPicked] = useState<Date[]>([]);
  const isPicked = (date: Date) =>
    picked.some((item) => dateKey(item) === dateKey(date));
  const toggle = (date: Date) => {
    setPicked(
      isPicked(date)
        ? picked.filter((item) => dateKey(item) !== dateKey(date))
        : [...picked, date].sort((a, b) => a.getTime() - b.getTime())
    );
  };
  const suggestions = Array.from({ length: 45 }, (_, index) =>
    addDays(designToday, index)
  )
    .filter((date) => everyoneOff(members, date))
    .slice(0, suggestionCount);
  return (
    <div className="gr-sheet-backdrop">
      <section aria-label="日にちを共有" className="gr-sheet">
        <header className="gr-sheet-header">
          <button className="st-custom-cancel" onClick={onClose} type="button">
            キャンセル
          </button>
          <h3>日にちを共有</h3>
          <button
            className="pe-save"
            disabled={picked.length === 0}
            onClick={() => {
              onShare(picked);
            }}
            type="button"
          >
            送る
          </button>
        </header>
        {suggestions.length > 0 && (
          <div className="gr-sheet-suggest">
            <span className="gr-together-label">みんな休み</span>
            {suggestions.map((date) => (
              <button
                aria-pressed={isPicked(date)}
                key={dateKey(date)}
                onClick={() => {
                  toggle(date);
                }}
                type="button"
              >
                {date.getMonth() + 1}/{date.getDate()}
                <small className="gr-small-weekday">
                  {weekdayLabels[date.getDay()]}
                </small>
              </button>
            ))}
          </div>
        )}
        <div className="gr-month">
          <button
            aria-label="前の月"
            onClick={() => {
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <strong aria-live="polite">
            {month.getFullYear()}年{month.getMonth() + 1}月
          </strong>
          <button
            aria-label="次の月"
            onClick={() => {
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="gr-pick-days">
          {weekdayLabels.map((label) => (
            <span aria-hidden="true" className="gr-pick-weekday" key={label}>
              {label}
            </span>
          ))}
          {monthDates(month).map((date) => {
            const outside = !sameMonth(date, month);
            const together = !outside && everyoneOff(members, date);
            return (
              <button
                aria-label={`${formatDay(date)}${together ? "、みんな休み" : ""}`}
                aria-pressed={isPicked(date)}
                className={`gr-date ${weekendClassName(date)} ${together ? "gr-together-cell" : ""}`}
                disabled={outside}
                key={dateKey(date)}
                onClick={() => {
                  toggle(date);
                }}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        <p className="st-note">
          {picked.length > 0
            ? `${picked.length}日分のみんなのシフトを送ります。`
            : "日付に枠がある日は、みんな休みの日です。"}
        </p>
      </section>
    </div>
  );
}

const dayMs = 24 * 60 * 60 * 1000;

// How far a day is from today, the way people say it: 今日, 明日, 3日後.
function daysFromToday(date: Date) {
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(
        designToday.getFullYear(),
        designToday.getMonth(),
        designToday.getDate()
      ).getTime()) /
      dayMs
  );
  if (days === 0) {
    return "今日";
  }
  if (days === 1) {
    return "明日";
  }
  return `${days}日後`;
}

const suggestionCount = 4;

// 日ごと reads most easily, so it comes first while everyone fits across;
// past that it scrolls sideways, and 週ごと, which grows only downwards,
// takes over. 人ごと shows one member at a time in a calendar like yours.
type Layout = "weeks" | "days" | "person";

const layoutOptions: { layout: Layout; name: string }[] = [
  { layout: "weeks", name: "週ごと" },
  { layout: "days", name: "日ごと" },
  { layout: "person", name: "人ごと" },
];

function defaultLayout(count: number): Layout {
  return count <= marksUpTo ? "days" : "weeks";
}

function ShiftsPage({
  group,
  backLabel,
  day,
  month: initialMonth,
  layout,
  onLayout: setLayout,
  onBack,
}: {
  group: Group;
  backLabel: string;
  // A day to open picked, from 次にみんな休み.
  day?: Date;
  month?: Date;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onBack: () => void;
}) {
  const [month, setMonth] = useState(initialMonth ?? designMonth);
  // Whose marks the legend sheet shows, when open.
  const [legend, setLegend] = useState<Member[]>();
  const [picked, setPicked] = useState<Date | undefined>(day);
  const [saved, setSaved] = useState(false);
  // The note that the picture was saved goes away by itself.
  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => {
      setSaved(false);
    }, savedNoteTime);
    return () => {
      clearTimeout(timer);
    };
  }, [saved]);
  const dates = monthDates(month);
  const pick = (date: Date) => {
    setPicked(picked && dateKey(picked) === dateKey(date) ? undefined : date);
  };
  return (
    <div className={`gr-shifts ${picked ? "gr-shifts-with-sheet" : ""}`}>
      <header className="st-page-header">
        <div className="pe-topbar">
          <button
            className="st-back gr-shifts-back"
            onClick={onBack}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
            <span className="gr-shifts-back-label">{backLabel}</span>
          </button>
          <ShiftsMenu
            layout={layout}
            onLayout={setLayout}
            onLegend={() => {
              setLegend(group.members);
            }}
            onSave={() => {
              setSaved(true);
            }}
          />
        </div>
      </header>
      <PagedShifts
        dates={dates}
        group={group}
        layout={layout}
        month={month}
        onMember={(member) => {
          setLegend([member]);
        }}
        onMonth={setMonth}
        onPickDay={pick}
        picked={picked}
      />
      {picked && (
        <PickedDaySheet
          date={picked}
          members={group.members}
          onClose={() => {
            setPicked(undefined);
          }}
        />
      )}
      {legend && (
        <LegendSheet
          members={legend}
          onClose={() => {
            setLegend(undefined);
          }}
        />
      )}
      <p aria-live="polite" className="gr-toast" hidden={!saved}>
        <Check aria-hidden="true" size={16} />
        {month.getMonth() + 1}月のシフト表を写真に保存しました
      </p>
    </div>
  );
}

// One pull-down for the page's secondary actions: how the table is laid
// out, what the marks mean, and saving it as a picture.
function ShiftsMenu({
  layout,
  onLayout,
  onLegend,
  onSave,
}: {
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onLegend: () => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = layoutOptions.find((option) => option.layout === layout);
  const act = (action: () => void) => () => {
    action();
    setOpen(false);
  };
  return (
    <span className="gr-menu-anchor">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="gr-menu-button"
        onClick={() => {
          setOpen(!open);
        }}
        type="button"
      >
        {current?.name}
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {open && (
        <>
          <button
            aria-label="メニューを閉じる"
            className="gr-menu-backdrop"
            onClick={() => {
              setOpen(false);
            }}
            type="button"
          />
          <div className="gr-menu" role="menu">
            {layoutOptions.map((option) => (
              <button
                aria-checked={layout === option.layout}
                key={option.layout}
                onClick={act(() => {
                  onLayout(option.layout);
                })}
                role="menuitemradio"
                type="button"
              >
                <Check
                  aria-hidden="true"
                  className="gr-menu-check"
                  size={16}
                  visibility={layout === option.layout ? "visible" : "hidden"}
                />
                {option.name}
              </button>
            ))}
            <hr />
            <button onClick={act(onLegend)} role="menuitem" type="button">
              <Info aria-hidden="true" className="gr-menu-icon" size={16} />
              シフトパターン
            </button>
            <button onClick={act(onSave)} role="menuitem" type="button">
              <Download aria-hidden="true" className="gr-menu-icon" size={16} />
              画像で保存
            </button>
          </div>
        </>
      )}
    </span>
  );
}

const savedNoteTime = 2200;

function PagedShifts({
  group,
  layout,
  month,
  dates,
  picked,
  onMonth,
  onPickDay,
  onMember,
}: {
  group: Group;
  layout: Layout;
  month: Date;
  dates: Date[];
  picked?: Date;
  onMonth: (month: Date) => void;
  onPickDay: (date: Date) => void;
  onMember: (member: Member) => void;
}) {
  // Whom 人ごと shows; chosen above the month, like a filter.
  const [personId, setPersonId] = useState(
    group.members.find((member) => !member.me)?.id ?? group.members[0].id
  );
  const person =
    group.members.find((member) => member.id === personId) ?? group.members[0];
  const offDays = dates.filter(
    (date) => sameMonth(date, month) && everyoneOff(group.members, date)
  );
  const thisMonth =
    sameMonth(month, designToday) &&
    month.getFullYear() === designToday.getFullYear();
  return (
    <>
      {layout === "person" && (
        <PeoplePicker
          members={group.members}
          onPick={setPersonId}
          picked={person}
        />
      )}
      <div className="gr-shifts-month">
        <span />
        <div className="gr-month">
          <button
            aria-label="前の月"
            onClick={() => {
              onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <strong aria-live="polite">
            {month.getFullYear()}年{month.getMonth() + 1}月
          </strong>
          <button
            aria-label="次の月"
            onClick={() => {
              onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
        <button
          aria-label="今月に戻る"
          className="dc-this-month"
          disabled={thisMonth}
          onClick={() => {
            onMonth(
              new Date(designToday.getFullYear(), designToday.getMonth(), 1)
            );
          }}
          type="button"
        >
          今月
        </button>
      </div>
      {layout === "days" && (
        <DayRowsTable
          days={dates.filter((date) => sameMonth(date, month))}
          group={group}
          onMember={onMember}
          onPickDay={onPickDay}
          picked={picked}
        />
      )}
      {layout === "weeks" && (
        <MemberTable
          dates={dates}
          group={group}
          month={month}
          onMember={onMember}
          onPickDay={onPickDay}
          picked={picked}
        />
      )}
      {layout === "person" && (
        <PersonCalendar
          dates={dates}
          group={group}
          member={person}
          month={month}
          onPickDay={onPickDay}
          picked={picked}
        />
      )}
      {/* 人ごと fits on one screen under its own month switch, like the
          calendar tab, so only the long tables get a way on at the foot. */}
      {layout !== "person" && <MonthFoot month={month} onMonth={onMonth} />}
      {/* Like the calendar tab's days-off total: the count, and the dates
          in a sheet, so a month with many shared days off stays one line. */}
      <TogetherSummary
        days={offDays}
        label={`${thisMonth ? "今月" : `${month.getMonth() + 1}月`}のみんな休み`}
        onPickDay={onPickDay}
      />
      {layout !== "person" && (
        <p className="st-note">
          アイコンを押すとその人のシフトパターン、マスを押すとその日のみんなの予定が見られます。
        </p>
      )}
    </>
  );
}

function TogetherSummary({
  label,
  days,
  onPickDay,
}: {
  label: string;
  days: Date[];
  onPickDay: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  if (days.length === 0) {
    return (
      <div className="dc-summary gr-together-summary">
        <span>{label}</span>
        <span className="gr-together-none">なし</span>
      </div>
    );
  }
  return (
    <>
      <button
        className="dc-summary gr-together-summary"
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        <span>{label}</span>
        <strong>
          {days.length}
          <span>日</span>
          <ChevronRight aria-hidden="true" size={17} />
        </strong>
      </button>
      {open && (
        <div className="gr-sheet-backdrop">
          <section aria-label={label} className="gr-sheet gr-legend-sheet">
            <header className="gr-sheet-header">
              <span />
              <h3>{label}</h3>
              <button
                className="pe-save"
                onClick={() => {
                  setOpen(false);
                }}
                type="button"
              >
                閉じる
              </button>
            </header>
            {/* Picking a date closes this and shows everyone that day. */}
            <div className="gr-legend-body">
              <div className="st-list">
                {days.map((date) => (
                  <button
                    className="st-row"
                    key={dateKey(date)}
                    onClick={() => {
                      setOpen(false);
                      onPickDay(date);
                    }}
                    type="button"
                  >
                    <span className="st-row-label">{formatDay(date)}</span>
                    <span className="st-row-value">
                      {holidayName(date) ?? ""}
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="st-row-arrow"
                      size={17}
                    />
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// At the end of the month, the next one is a tap away without going back
// up; the page then starts again from the top.
function MonthFoot({
  month,
  onMonth,
}: {
  month: Date;
  onMonth: (month: Date) => void;
}) {
  const previous = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const go = (target: Date, button: HTMLElement) => {
    onMonth(target);
    button.closest(".st-scroll")?.scrollTo({ top: 0 });
  };
  return (
    <div className="gr-month-foot">
      <button
        onClick={(event) => {
          go(previous, event.currentTarget);
        }}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={16} />
        {previous.getMonth() + 1}月
      </button>
      <button
        onClick={(event) => {
          go(next, event.currentTarget);
        }}
        type="button"
      >
        {next.getMonth() + 1}月
        <ChevronRight aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

// The day picked in the table, in a sheet along the bottom. It leaves the
// table undimmed and live: the picked day stays framed above it, and
// picking another day switches the sheet to that day.
function PickedDaySheet({
  date,
  members,
  onClose,
}: {
  date: Date;
  members: Member[];
  onClose: () => void;
}) {
  const together = everyoneOff(members, date);
  return (
    <section aria-label={formatDay(date)} className="gr-day-sheet">
      <div aria-hidden="true" className="dc-sheet-handle" />
      <header className="gr-day-sheet-header">
        <h3>{formatDay(date)}</h3>
        {together && <span className="gr-day-card-tag">みんな休み</span>}
        <button className="pe-save" onClick={onClose} type="button">
          閉じる
        </button>
      </header>
      <div className="st-list gr-day-sheet-list">
        {members.map((member) => {
          const item = patternOn(member, date);
          return (
            <div className="st-row" key={member.id}>
              <Avatar member={member} />
              <span className="st-row-label">{member.name}</span>
              <span className="st-row-value gr-day-sheet-value">
                {item && (
                  <MemberMark look={item.look} member={member} size={18} />
                )}
                {item?.name ?? "未入力"}
                {item?.time && (
                  <small className="gr-day-sheet-time">{item.time}</small>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// What each mark means, for one person or everyone, in their own style.
function LegendSheet({
  members,
  onClose,
}: {
  members: Member[];
  onClose: () => void;
}) {
  const single = members.length === 1 ? members[0] : undefined;
  return (
    <div className="gr-sheet-backdrop">
      <section
        aria-label={
          single ? `${single.name}のシフトパターン` : "みんなのシフトパターン"
        }
        className="gr-sheet gr-legend-sheet"
      >
        <header className="gr-sheet-header">
          <span />
          <h3 className="gr-legend-title">
            {single && <Avatar member={single} />}
            {single
              ? `${single.name}のシフトパターン`
              : "みんなのシフトパターン"}
          </h3>
          <button className="pe-save" onClick={onClose} type="button">
            閉じる
          </button>
        </header>
        {/* Only the marks scroll; the title and 閉じる stay in reach. */}
        <div className="gr-legend-body">
          {members.map((member) => (
            <section className="st-section" key={member.id}>
              {!single && (
                <h4 className="gr-legend-member">
                  <Avatar member={member} />
                  {member.me ? "自分" : member.name}
                </h4>
              )}
              <div className="st-list">
                {member.patterns.map((item) => (
                  <div className="st-row" key={item.id}>
                    <MemberMark look={item.look} member={member} size={20} />
                    <span className="st-row-label">{item.name}</span>
                    <span className="st-row-value">{item.time ?? ""}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

// How much fits across: names up to four people, marks alone up to seven,
// then the table scrolls sideways with the dates and you kept in view.
type Density = "names" | "marks" | "scroll";

function densityOf(count: number): Density {
  if (count <= namesUpTo) {
    return "names";
  }
  return count <= marksUpTo ? "marks" : "scroll";
}

const namesUpTo = 4;
const marksUpTo = 7;

// One row per day and a column per member, like a printed roster.
function DayRowsTable({
  group,
  days,
  picked,
  onMember,
  onPickDay,
}: {
  group: Group;
  days: Date[];
  picked?: Date;
  // Opens a member's legend from their face or name, as in 週ごと.
  onMember: (member: Member) => void;
  onPickDay: (date: Date) => void;
}) {
  const density = densityOf(group.members.length);
  const withNames = density === "names";
  const columnWidth = withNames ? rowsMemberWidth : rowsMarkWidth;
  return (
    <div
      className={`gr-rows-scroll ${density === "scroll" ? "" : "gr-rows-page"}`}
    >
      <table
        className={`gr-rows gr-density-${density}`}
        style={{
          minWidth: rowsDateWidth + group.members.length * columnWidth,
        }}
      >
        <caption className="dc-sr-only">みんなのシフト</caption>
        <thead>
          <tr>
            <th className="gr-rows-corner" scope="col">
              {/* Pinned with the names, so the month stays in sight. */}
              <span aria-hidden="true" className="gr-corner-month">
                {days[0].getMonth() + 1}月
              </span>
              <span className="dc-sr-only">日付</span>
            </th>
            {group.members.map((member) => (
              <th
                className={member.me ? "gr-rows-me" : ""}
                key={member.id}
                scope="col"
              >
                <button
                  aria-label={`${member.name}のシフトパターン`}
                  className="gr-rows-member gr-rows-member-button"
                  onClick={() => {
                    onMember(member);
                  }}
                  type="button"
                >
                  <Avatar member={member} />
                  {withNames ? member.name : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((date) => (
            <DayRow
              date={date}
              key={dateKey(date)}
              members={group.members}
              onPick={onPickDay}
              picked={picked !== undefined && dateKey(picked) === dateKey(date)}
              withNames={withNames}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayRow({
  date,
  members,
  withNames,
  picked,
  onPick,
}: {
  date: Date;
  members: Member[];
  withNames: boolean;
  picked: boolean;
  onPick: (date: Date) => void;
}) {
  const together = everyoneOff(members, date);
  const today = dateKey(date) === dateKey(designToday);
  return (
    <tr
      className={`${together ? "gr-together-cell" : ""} ${today ? "gr-rows-today" : ""} ${picked ? "gr-rows-picked" : ""}`}
    >
      <th className="gr-rows-date" scope="row">
        <RowDate
          date={date}
          onPick={() => {
            onPick(date);
          }}
          picked={picked}
        />
        {together && <span className="dc-sr-only">みんな休み</span>}
      </th>
      {members.map((member) => {
        const item = patternOn(member, date);
        return (
          <td
            className={`${member.me ? "gr-rows-me" : ""} ${item?.off ? "gr-off-cell" : ""}`}
            key={member.id}
          >
            {/* The whole row picks the day, as the whole column does in
                週ごと. */}
            <button
              aria-label={`${formatDay(date)} ${member.name}：${item?.name ?? "未入力"}。押すとその日のみんなの予定`}
              aria-pressed={picked}
              className="gr-rows-cell-button"
              onClick={() => {
                onPick(date);
              }}
              type="button"
            >
              {item ? (
                <span className="gr-rows-cell">
                  <MemberMark look={item.look} member={member} size={16} />
                  <span className={withNames ? "gr-rows-name" : "dc-sr-only"}>
                    {item.name}
                  </span>
                </span>
              ) : (
                <span className="gr-rows-empty">
                  {withNames ? "未入力" : "・"}
                </span>
              )}
            </button>
          </td>
        );
      })}
    </tr>
  );
}

function RowDate({
  date,
  picked,
  onPick,
}: {
  date: Date;
  picked: boolean;
  onPick?: () => void;
}) {
  const label = (
    <span className={`gr-date ${weekendClassName(date)}`}>
      {date.getDate()}
      <small className="gr-rows-weekday">{weekdayLabels[date.getDay()]}</small>
    </span>
  );
  if (!onPick) {
    return label;
  }
  return (
    <button
      aria-label={`${formatDay(date)}の予定を見る`}
      aria-pressed={picked}
      className="gr-rows-date-button"
      onClick={onPick}
      type="button"
    >
      {label}
    </button>
  );
}

const rowsDateWidth = 46;
const rowsMemberWidth = 76;
const rowsMarkWidth = 40;

function presetLook(id: string) {
  return sampleLooks[id as keyof typeof sampleLooks] ?? sampleLooks.natural;
}

// Draws one of a member's marks in the shape they picked (mark kind and
// fill), in the viewer's カラー and トーン, so everyone's colors sit
// together on one screen. You and members without a style of their own
// use the viewer's style.
// A member's own shape and カラー for the marks inside, drawn in the
// viewer's tone and light or dark. You (no style of your own here) keep
// the viewer's settings.
function MemberLook({
  member,
  children,
}: {
  member: Member;
  children: ReactNode;
}) {
  const viewer = {
    monochrome: useContext(MonochromeContext).monochrome,
    style: useContext(ShiftMarkStyleContext),
    theme: useContext(ThemeContext).theme,
    weight: useContext(IconWeightContext),
  };
  const theirs = member.style;
  const color = theirs?.color ?? "multi";
  const look = theirs
    ? {
        monochrome: color !== "multi",
        style: theirs.look.style,
        theme: themeOfColor(color),
        weight: theirs.look.fill ? ("duotone" as const) : ("regular" as const),
      }
    : viewer;
  return (
    <ThemeContext value={{ theme: look.theme }}>
      <MonochromeContext value={{ monochrome: look.monochrome }}>
        <ShiftMarkStyleContext value={look.style}>
          <IconWeightContext value={look.weight}>{children}</IconWeightContext>
        </ShiftMarkStyleContext>
      </MonochromeContext>
    </ThemeContext>
  );
}

function MemberMark({
  member,
  look,
  size,
}: {
  member: Member;
  look: Look;
  size: number;
}) {
  return (
    <MemberLook member={member}>
      <ViewerMark look={look} size={size} />
    </MemberLook>
  );
}

function ViewerMark({ look, size }: { look: Look; size: number }) {
  const style = useContext(ShiftMarkStyleContext);
  return <MarkGlyph look={look} size={size} style={style} />;
}

function Avatar({ member, size }: { member: Member; size?: number }) {
  return (
    <PhotoAvatar
      me={member.me}
      name={member.name}
      photo={member.photo}
      size={size}
    />
  );
}

// A round picture, or the first letter of the name without one.
export function PhotoAvatar({
  name,
  photo,
  me = false,
  size = defaultAvatarSize,
}: {
  name: string;
  photo?: string;
  me?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={`gr-avatar ${me ? "gr-avatar-me" : ""}`}
      style={{ fontSize: Math.round(size * 0.45), height: size, width: size }}
    >
      {photo ? (
        <img alt="" height={size} loading="lazy" src={photo} width={size} />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}

const defaultAvatarSize = 24;
const chatAvatarSize = 32;
const compactAvatarSize = 20;

function Mark({
  member,
  date,
  size,
}: {
  member: Member;
  date: Date;
  size: number;
}) {
  const item = patternOn(member, date);
  if (!item) {
    return <span aria-hidden="true" className="gr-empty" />;
  }
  return <MemberMark look={item.look} member={member} size={size} />;
}

// One person's day in the weekly table. With `onPick` it is a button that
// shows the whole day by name below the table.
// The date atop a week's column; like the marks under it, it picks the day.
function WeekDate({
  date,
  members,
  month,
  picked,
  onPick,
}: {
  date: Date;
  members: Member[];
  month?: Date;
  picked: boolean;
  onPick?: (date: Date) => void;
}) {
  const className = `gr-table-date gr-date ${weekendClassName(date)} ${!month || sameMonth(date, month) ? "" : "gr-outside"} ${everyoneOff(members, date) ? "gr-together-cell" : ""} ${picked ? "gr-picked-cell" : ""}`;
  if (!onPick) {
    return <span className={className}>{date.getDate()}</span>;
  }
  return (
    <button
      aria-label={`${formatDay(date)}の予定を見る`}
      aria-pressed={picked}
      className={`${className} gr-table-cell-button`}
      onClick={() => {
        onPick(date);
      }}
      type="button"
    >
      {date.getDate()}
    </button>
  );
}

function WeekCell({
  date,
  member,
  members,
  month,
  picked,
  onPick,
}: {
  date: Date;
  member: Member;
  members: Member[];
  month?: Date;
  picked: boolean;
  onPick?: (date: Date) => void;
}) {
  const item = patternOn(member, date);
  const className = `gr-table-cell ${!month || sameMonth(date, month) ? "" : "gr-outside"} ${item?.off ? "gr-off-cell" : ""} ${everyoneOff(members, date) ? "gr-together-cell" : ""} ${picked ? "gr-picked-cell" : ""}`;
  const label = `${formatDay(date)} ${member.name}：${item?.name ?? "未入力"}`;
  if (!onPick) {
    return (
      <span aria-label={label} className={className} role="img">
        <Mark date={date} member={member} size={18} />
      </span>
    );
  }
  return (
    <button
      aria-label={`${label}。押すとその日のみんなの予定`}
      aria-pressed={picked}
      className={`${className} gr-table-cell-button`}
      onClick={() => {
        onPick(date);
      }}
      type="button"
    >
      <Mark date={date} member={member} size={18} />
    </button>
  );
}

// A block per week: dates across, one row per member underneath.
function MemberTable({
  group,
  dates,
  month,
  compact = false,
  onMember,
  onPickDay,
  picked,
}: {
  group: Group;
  dates: Date[];
  // The month shown; days outside it are dimmed.
  month?: Date;
  // A single week inside a card, without its own frame.
  compact?: boolean;
  // Opens a member's legend from their avatar.
  onMember?: (member: Member) => void;
  // Picks a day to list everyone's shifts with names.
  onPickDay?: (date: Date) => void;
  picked?: Date;
}) {
  // Short rows in the card: smaller faces keep a gap between them, the
  // height of the day-off tiles beside them.
  const avatarSize = compact ? compactAvatarSize : undefined;
  const weeks = Array.from({ length: dates.length / weekLength }, (_, row) =>
    dates.slice(row * weekLength, (row + 1) * weekLength)
  );
  return (
    <div className={`gr-table ${compact ? "gr-table-compact" : ""}`}>
      <div aria-hidden="true" className="gr-table-row gr-table-weekdays">
        {/* Pinned above the weeks, so the month stays in sight. */}
        <span className="gr-corner-month">
          {month && !compact ? `${month.getMonth() + 1}月` : ""}
        </span>
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {weeks.map((week) => (
        <section
          aria-label={`${formatDay(week[0])}からの週`}
          className="gr-week"
          key={dateKey(week[0])}
        >
          <div className="gr-table-row gr-table-dates">
            <span />
            {week.map((date) => (
              <WeekDate
                date={date}
                key={dateKey(date)}
                members={group.members}
                month={month}
                onPick={onPickDay}
                picked={
                  picked !== undefined && dateKey(picked) === dateKey(date)
                }
              />
            ))}
          </div>
          {group.members.map((member) => (
            <div className="gr-table-row" key={member.id}>
              {onMember ? (
                <button
                  aria-label={`${member.name}のシフトパターン`}
                  className="gr-table-name gr-table-name-button"
                  onClick={() => {
                    onMember(member);
                  }}
                  type="button"
                >
                  <Avatar member={member} size={avatarSize} />
                </button>
              ) : (
                <span className="gr-table-name">
                  <Avatar member={member} size={avatarSize} />
                  <span className="dc-sr-only">{member.name}</span>
                </span>
              )}
              {week.map((date) => (
                <WeekCell
                  date={date}
                  key={dateKey(date)}
                  member={member}
                  members={group.members}
                  month={month}
                  onPick={onPickDay}
                  picked={
                    picked !== undefined && dateKey(picked) === dateKey(date)
                  }
                />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// Matches the side padding of .gr-people, so a scrolled-to person keeps
// the same gap from the screen's edge as the first one.
const peopleEdge = 19;

// 人ごと: who to show, above the month.
function PeoplePicker({
  members,
  picked,
  onPick,
}: {
  members: Member[];
  picked: Member;
  onPick: (id: string) => void;
}) {
  const listRef = useRef<HTMLFieldSetElement>(null);
  // Keep the chosen person in sight, sideways only, so the page itself does
  // not jump.
  useEffect(() => {
    const list = listRef.current;
    const button = list?.querySelector<HTMLElement>(
      `[data-member="${picked.id}"]`
    );
    if (!(list && button)) {
      return;
    }
    const start = button.offsetLeft - peopleEdge;
    const end = button.offsetLeft + button.offsetWidth + peopleEdge;
    if (start < list.scrollLeft) {
      list.scrollTo({ behavior: "smooth", left: start });
    } else if (end > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ behavior: "smooth", left: end - list.clientWidth });
    }
  }, [picked.id]);
  return (
    <fieldset className="gr-people" ref={listRef}>
      <legend className="dc-sr-only">表示する人</legend>
      {members.map((member) => (
        <button
          aria-pressed={member.id === picked.id}
          data-member={member.id}
          key={member.id}
          onClick={() => {
            onPick(member.id);
          }}
          type="button"
        >
          <Avatar member={member} />
          {member.name}
        </button>
      ))}
    </fieldset>
  );
}

// One member at a time, in the same kind of calendar as your own. Shift
// names always show under the marks and days off are always lit, whatever
// the member's style, so no separate list of their patterns is needed.
function PersonCalendar({
  group,
  member,
  dates,
  month,
  picked,
  onPickDay,
}: {
  group: Group;
  member: Member;
  dates: Date[];
  month: Date;
  picked?: Date;
  // Picks a day to list everyone's shifts, as in 週ごと and 日ごと.
  onPickDay: (date: Date) => void;
}) {
  const me = group.members.find((item) => item.me);
  return (
    <>
      {/* The same grid and cells as your own calendar, so the two read
          alike; one wrapper keeps the page's gap from splitting them. */}
      <div>
        <div aria-hidden="true" className="dc-weekdays">
          {weekdayLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div
          className="dc-grid"
          style={{ "--weeks": dates.length / weekLength } as CSSProperties}
        >
          <MemberLook member={member}>
            {dates.map((date) => (
              <PersonDay
                date={date}
                key={dateKey(date)}
                me={me}
                member={member}
                onPick={onPickDay}
                outside={!sameMonth(date, month)}
                picked={
                  picked !== undefined && dateKey(picked) === dateKey(date)
                }
              />
            ))}
          </MemberLook>
        </div>
      </div>
      <p className="st-note">
        {member.me ? "" : "薄い枠の日は、自分も休みの日です。"}
        日付を押すと、その日のみんなの予定が見られます。
      </p>
    </>
  );
}

// One day of 人ごと, drawn like a day of your own calendar: the shift name
// always shows, a day off takes its pattern's tint, and a day you are both
// off is framed. Pressing it opens everyone's shifts that day.
function PersonDay({
  date,
  member,
  me,
  outside,
  picked,
  onPick,
}: {
  date: Date;
  member: Member;
  me?: Member;
  outside: boolean;
  picked: boolean;
  onPick: (date: Date) => void;
}) {
  const item = outside ? undefined : patternOn(member, date);
  // In their カラー, like their marks.
  const { tint } = useDisplayColor(item?.look.color ?? 0);
  const withMe =
    !(outside || member.me) &&
    me !== undefined &&
    everyoneOff([me, member], date);
  const off = item?.off === true;
  const className = `dc-day ${outside ? "dc-outside" : ""} ${off ? "dc-off" : ""} ${withMe ? "gr-person-with-me" : ""} ${picked ? "dc-active-day" : ""}`;
  const style = off ? ({ "--off-tint": tint } as CSSProperties) : undefined;
  const content = (
    <>
      <span className={`dc-date ${holidayName(date) ? "dc-holiday" : ""}`}>
        {date.getDate()}
      </span>
      {item && (
        <>
          <span className="dc-emoji">
            <MemberMark look={item.look} member={member} size={21} />
          </span>
          <span className="dc-shift-label">{item.name}</span>
        </>
      )}
    </>
  );
  if (outside) {
    return (
      <div aria-hidden="true" className={className} style={style}>
        {content}
      </div>
    );
  }
  return (
    <button
      aria-label={`${formatDay(date)}：${item?.name ?? "未入力"}${withMe ? "、自分も休み" : ""}。押すとその日のみんなの予定`}
      aria-pressed={picked}
      className={className}
      onClick={() => {
        onPick(date);
      }}
      style={style}
      type="button"
    >
      {content}
    </button>
  );
}

// Picking a picture: none, a sample, or one from the device. With
// `usual`, the first choice follows the usual profile picture instead.
// Your picture, uploaded from the device: tapping it or 写真を変更 opens the
// photo library, as in other apps.
export function PhotoEditor({
  name,
  photo,
  size,
  onUpload,
  onRemove,
  onUsual,
}: {
  name: string;
  photo?: string;
  size: number;
  onUpload: (photo: string) => void;
  // Shown while there is a picture to take off.
  onRemove?: () => void;
  // A group's own picture can go back to the usual one.
  onUsual?: () => void;
}) {
  const inputId = useId();
  return (
    <div className="st-profile-photo">
      <input
        accept="image/*"
        className="dc-sr-only"
        id={inputId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onUpload(URL.createObjectURL(file));
          }
        }}
        type="file"
      />
      <label aria-hidden="true" className="st-photo-edit" htmlFor={inputId}>
        <PhotoAvatar name={name} photo={photo} size={size} />
        <span className="st-photo-badge">
          <Camera size={14} />
        </span>
      </label>
      <div className="st-photo-actions">
        <label className="st-photo-action" htmlFor={inputId}>
          写真を変更
        </label>
        {onUsual && (
          <button className="st-photo-action" onClick={onUsual} type="button">
            いつもの写真に戻す
          </button>
        )}
        {onRemove && (
          <button className="st-photo-action" onClick={onRemove} type="button">
            写真を外す
          </button>
        )}
      </div>
    </div>
  );
}

// How you appear in one group, starting from your usual profile, and who
// else is in it.
function GroupSettingsPage({
  group,
  profile,
  onChange,
  onMark,
  onInvite,
  onBack,
}: {
  group: Group;
  profile: Profile;
  onChange: (mine: GroupProfile | undefined) => void;
  onMark: (mark: GroupMark) => void;
  onInvite: () => void;
  onBack: () => void;
}) {
  const [editingMark, setEditingMark] = useState(false);
  const mine = group.mine ?? {};
  const shown = profileIn(group, profile);
  const update = (change: GroupProfile) => {
    const next = { ...mine, ...change };
    const plain =
      (next.name === undefined || next.name === profile.name) &&
      next.photo === undefined &&
      !next.noPhoto;
    onChange(plain ? undefined : next);
  };
  const usualPhoto = mine.photo === undefined && !mine.noPhoto;
  if (editingMark) {
    return (
      <GroupMarkPage
        back="グループの設定"
        mark={group.mark}
        name={group.name}
        onBack={() => {
          setEditingMark(false);
        }}
        onChange={onMark}
      />
    );
  }
  return (
    <>
      <PageHeaderBack label={group.name} onBack={onBack} />
      <h3 className="st-title">グループの設定</h3>
      <section className="st-section">
        <h4>グループ</h4>
        <div className="st-list">
          <div className="st-row">
            <span className="st-row-label">グループ名</span>
            <span className="st-row-value">{group.name}</span>
          </div>
          <MarkRow
            mark={group.mark}
            onOpen={() => {
              setEditingMark(true);
            }}
          />
        </div>
      </section>
      <section className="st-section st-profile-section">
        <h4>このグループでのあなた</h4>
        <PhotoEditor
          name={shown.name}
          onRemove={
            shown.photo
              ? () => {
                  update({ noPhoto: true, photo: undefined });
                }
              : undefined
          }
          onUpload={(photo) => {
            update({ noPhoto: false, photo });
          }}
          onUsual={
            usualPhoto
              ? undefined
              : () => {
                  update({ noPhoto: false, photo: undefined });
                }
          }
          photo={shown.photo}
          size={72}
        />
        <div className="st-list">
          <label className="st-row">
            <span className="st-row-label">名前</span>
            <input
              className="pe-inline-input"
              onChange={(event) => {
                update({ name: event.target.value });
              }}
              placeholder={profile.name}
              value={mine.name ?? profile.name}
            />
          </label>
        </div>
        <p className="st-note">
          このグループの人にだけ、この名前と写真で表示されます。変えなければ、設定のプロフィールと同じです。
        </p>
      </section>
      <section className="st-section">
        <h4>メンバー</h4>
        <div className="st-list">
          {group.members.map((member) => (
            <div className="st-row" key={member.id}>
              <Avatar member={member} />
              <span className="st-row-label">
                {member.me ? `${shown.name}（自分）` : member.name}
              </span>
            </div>
          ))}
          <button className="st-row" onClick={onInvite} type="button">
            <UserPlus aria-hidden="true" className="gr-row-icon" size={18} />
            <span className="st-row-label">メンバーを招待</span>
          </button>
        </div>
      </section>
      <button className="pe-delete" type="button">
        このグループから抜ける
      </button>
    </>
  );
}

function PageHeaderBack({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) {
  return (
    <button className="st-back" onClick={onBack} type="button">
      <ChevronLeft aria-hidden="true" size={20} />
      {label}
    </button>
  );
}

// Your name and picture in a group: its own, or the usual ones.
function profileIn(group: Omit<Group, "members">, profile: Profile): Profile {
  const { mine } = group;
  return {
    name: mine?.name || profile.name,
    photo: mine?.noPhoto ? undefined : (mine?.photo ?? profile.photo),
  };
}

function InvitePage({
  group,
  onBack,
}: {
  group: Omit<Group, "members">;
  onBack: () => void;
}) {
  return (
    <>
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          {group.name}
        </button>
        <h3 className="st-title">メンバーを招待</h3>
      </header>
      <div className="gr-qr">
        <QrCode aria-hidden="true" size={132} strokeWidth={1.2} />
        <small className="gr-qr-note">
          この画面を相手に読み取ってもらいます
        </small>
      </div>
      <button className="st-primary" type="button">
        <Send aria-hidden="true" size={16} />
        招待リンクを送る
      </button>
      <button className="gr-secondary" type="button">
        <Copy aria-hidden="true" size={15} />
        リンクをコピー
      </button>
      <p className="st-note">
        リンクを知っている人は、だれでも「{group.name}
        」に参加できます。送る相手に気をつけてください。
      </p>
      <button className="st-link" type="button">
        招待リンクを作り直す
      </button>
    </>
  );
}

// A group's face: one choice made by whoever set it up, the same for every
// member whatever their style, like a group picture in a chat app.
export type GroupMark =
  | { kind: "emoji"; emoji: string }
  | { kind: "icon"; icon: MarkIcon; color: number }
  | { kind: "letter"; text: string; color: number }
  | { kind: "photo"; photo: string };

type GroupMarkKind = GroupMark["kind"];

// Words in a name that suggest an emoji.
const groupHints: { words: string[]; emoji: string }[] = [
  { emoji: "🏠", words: ["家族", "家", "夫婦"] },
  { emoji: "🎓", words: ["学校", "同期", "クラス", "ゼミ"] },
  { emoji: "💼", words: ["職場", "会社", "仕事", "病棟"] },
  { emoji: "✈️", words: ["旅行", "旅"] },
  { emoji: "🍙", words: ["ごはん", "飲み", "ランチ"] },
  { emoji: "👭", words: ["友達", "友だち", "仲間"] },
];

function firstLetter(name: string) {
  return [...name.trim()][0] ?? "";
}

// From the name alone: a fitting emoji, or else its first letter.
function guessGroupMark(name: string, color: number): GroupMark {
  const hint = groupHints.find(({ words }) =>
    words.some((word) => name.includes(word))
  );
  return hint
    ? { emoji: hint.emoji, kind: "emoji" }
    : { color, kind: "letter", text: firstLetter(name) };
}

function colorOfMark(mark: GroupMark) {
  return mark.kind === "icon" || mark.kind === "letter" ? mark.color : 0;
}

// Draws the mark to fill a round frame; styles never change it. `bare`
// leaves out the tinted ground, for choices laid out on their own tiles.
function GroupIcon({
  mark,
  size,
  bare = false,
}: {
  mark: GroupMark;
  size: number;
  bare?: boolean;
}) {
  const { color, tint } = useMarkColor("color" in mark ? mark.color : 0);
  if (mark.kind === "photo") {
    return (
      <img
        alt=""
        className="gr-mark-photo"
        height={size}
        loading="lazy"
        src={mark.photo}
        width={size}
      />
    );
  }
  if (mark.kind === "emoji") {
    return (
      <span className="gr-mark-emoji" style={{ fontSize: size }}>
        {mark.emoji}
      </span>
    );
  }
  if (mark.kind === "letter") {
    return (
      <span
        className="gr-mark-letter"
        style={{ background: tint, color, fontSize: Math.round(size * 0.6) }}
      >
        {mark.text}
      </span>
    );
  }
  const Icon = markIcons[mark.icon];
  if (!Icon) {
    return null;
  }
  return (
    <span
      className={bare ? "gr-mark-icon-bare" : "gr-mark-icon"}
      style={{ background: bare ? undefined : tint, color }}
    >
      <Icon size={size} weight="duotone" />
    </span>
  );
}

const groupIcons: MarkIcon[] = [
  "house",
  "users",
  "heart",
  "graduationCap",
  "briefcase",
  "hospital",
  "utensils",
  "coffee",
  "plane",
  "music",
  "dumbbell",
  "star",
  "flower",
  "cat",
  "dog",
  "sparkles",
];

const groupEmojis = [
  "🏠",
  "👭",
  "🎓",
  "💼",
  "🌷",
  "🍙",
  "☕️",
  "✈️",
  "🎵",
  "⚽️",
  "🐾",
  "⭐️",
];

// A photo is uploaded from the picture itself, as with your profile, so
// only the marks made here have tabs.
type DrawnMarkKind = Exclude<GroupMarkKind, "photo">;

const markKinds: { kind: DrawnMarkKind; label: string }[] = [
  { kind: "emoji", label: "絵文字" },
  { kind: "icon", label: "アイコン" },
  { kind: "letter", label: "文字" },
];

const markGraphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

// One page to pick the group's mark: a kind, then one choice of it.
function GroupMarkPage({
  back,
  name,
  mark,
  onBack,
  onChange,
}: {
  back: string;
  name: string;
  mark: GroupMark;
  onBack: () => void;
  onChange: (mark: GroupMark) => void;
}) {
  // No tab is picked while the mark is a photo.
  const [kind, setKind] = useState<DrawnMarkKind | undefined>(
    mark.kind === "photo" ? undefined : mark.kind
  );
  const inputId = useId();
  const color = colorOfMark(mark);
  const letter = mark.kind === "letter" ? mark.text : firstLetter(name) || "グ";
  return (
    <>
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          {back}
        </button>
        <h3 className="st-title">アイコン</h3>
      </header>
      <div className="st-profile-photo">
        <input
          accept="image/*"
          className="dc-sr-only"
          id={inputId}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onChange({ kind: "photo", photo: URL.createObjectURL(file) });
              setKind(undefined);
            }
          }}
          type="file"
        />
        <label aria-hidden="true" className="st-photo-edit" htmlFor={inputId}>
          <span className="gr-rail-icon gr-mark-frame-large">
            <GroupIcon mark={mark} size={40} />
          </span>
          <span className="st-photo-badge">
            <Camera size={14} />
          </span>
        </label>
        <div className="st-photo-actions">
          <label className="st-photo-action" htmlFor={inputId}>
            {mark.kind === "photo" ? "写真を変更" : "写真を使う"}
          </label>
        </div>
      </div>
      <fieldset className="st-mark-segment gr-mark-kinds">
        <legend className="dc-sr-only">アイコンの種類</legend>
        {markKinds.map((option) => (
          <button
            aria-pressed={kind === option.kind}
            key={option.kind}
            onClick={() => {
              setKind(option.kind);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      {kind === "emoji" && (
        <>
          <fieldset className="pe-grid">
            <legend className="dc-sr-only">絵文字</legend>
            {groupEmojis.map((emoji) => (
              <button
                aria-pressed={mark.kind === "emoji" && mark.emoji === emoji}
                className="gr-mark-choice-emoji"
                key={emoji}
                onClick={() => {
                  onChange({ emoji, kind: "emoji" });
                }}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </fieldset>
          <input
            aria-label="ほかの絵文字を入力"
            className="dc-detail-note"
            onChange={(event) => {
              const emoji = markGraphemes
                .segment(event.target.value)
                [Symbol.iterator]()
                .next().value?.segment;
              if (emoji) {
                onChange({ emoji, kind: "emoji" });
              }
            }}
            placeholder="ほかの絵文字を入力"
            value=""
          />
        </>
      )}
      {kind === "icon" && (
        <>
          <fieldset className="pe-grid">
            <legend className="dc-sr-only">アイコン</legend>
            {groupIcons.map((icon) => (
              <button
                aria-label={iconNames[icon]}
                aria-pressed={mark.kind === "icon" && mark.icon === icon}
                key={icon}
                onClick={() => {
                  onChange({ color, icon, kind: "icon" });
                }}
                type="button"
              >
                <GroupIcon
                  bare
                  mark={{ color, icon, kind: "icon" }}
                  size={22}
                />
              </button>
            ))}
          </fieldset>
          <MarkColors
            color={color}
            onPick={(value) => {
              onChange(
                mark.kind === "icon"
                  ? { ...mark, color: value }
                  : { color: value, icon: groupIcons[0], kind: "icon" }
              );
            }}
          />
        </>
      )}
      {kind === "letter" && (
        <>
          <div className="st-list">
            <label className="st-row">
              <span className="st-row-label">文字</span>
              <input
                className="pe-inline-input"
                maxLength={2}
                onChange={(event) => {
                  onChange({ color, kind: "letter", text: event.target.value });
                }}
                value={letter}
              />
            </label>
          </div>
          <MarkColors
            color={color}
            onPick={(value) => {
              onChange({ color: value, kind: "letter", text: letter });
            }}
          />
        </>
      )}
      <p className="st-note">
        メンバー全員に、このアイコンがそのまま表示されます。シフトの見た目のスタイルには左右されません。
      </p>
    </>
  );
}

function MarkColors({
  color,
  onPick,
}: {
  color: number;
  onPick: (color: number) => void;
}) {
  const colors = useMarkColors();
  return (
    <fieldset className="pe-colors">
      <legend className="dc-repeat-label pe-colors-label">色</legend>
      {colors.map((option, index) => (
        <button
          aria-label={option.name}
          aria-pressed={color === index}
          key={option.name}
          onClick={() => {
            onPick(index);
          }}
          style={{ background: option.tint, color: option.color }}
          type="button"
        />
      ))}
    </fieldset>
  );
}

function NewGroupPage({
  usedColors,
  profile,
  onBack,
  onCreate,
}: {
  usedColors: number[];
  profile: Profile;
  onBack: () => void;
  onCreate: (group: { name: string; mark: GroupMark; myName: string }) => void;
}) {
  const [name, setName] = useState("");
  // Starts as your usual name; change it only if this group calls you
  // something else.
  const [myName, setMyName] = useState(profile.name);
  const [color] = useState(() => nextColor(usedColors));
  const [mark, setMark] = useState<GroupMark>(() => guessGroupMark("", color));
  // Once picked, the mark stays when the name changes afterwards.
  const [picked, setPicked] = useState(false);
  const [editingMark, setEditingMark] = useState(false);
  const canCreate = name.trim() !== "" && myName.trim() !== "";
  if (editingMark) {
    return (
      <GroupMarkPage
        back="グループを作る"
        mark={mark}
        name={name}
        onBack={() => {
          setEditingMark(false);
        }}
        onChange={(next) => {
          setMark(next);
          setPicked(true);
        }}
      />
    );
  }
  return (
    <>
      <header className="st-page-header">
        <div className="pe-topbar">
          <button className="st-back" onClick={onBack} type="button">
            <ChevronLeft aria-hidden="true" size={20} />
            グループ
          </button>
          <button
            className="pe-save"
            disabled={!canCreate}
            onClick={() => {
              onCreate({ mark, myName: myName.trim(), name: name.trim() });
            }}
            type="button"
          >
            作る
          </button>
        </div>
        <h3 className="st-title">グループを作る</h3>
      </header>
      <div className="st-list">
        <label className="st-row">
          <span className="st-row-label">グループ名</span>
          <input
            className="pe-inline-input"
            onChange={(event) => {
              setName(event.target.value);
              if (!picked) {
                setMark(guessGroupMark(event.target.value, color));
              }
            }}
            placeholder="例：家族"
            value={name}
          />
        </label>
        <MarkRow
          mark={mark}
          onOpen={() => {
            setEditingMark(true);
          }}
        />
        <label className="st-row">
          <span className="st-row-label">このグループでの名前</span>
          <input
            className="pe-inline-input"
            onChange={(event) => {
              setMyName(event.target.value);
            }}
            placeholder="例：さくら"
            value={myName}
          />
        </label>
      </div>
      <p className="st-note">
        アイコンはグループ名から自動で入ります。このグループでの名前は、最初はいつもの名前です。写真はあとからグループの設定で変えられます。
      </p>
    </>
  );
}

function MarkRow({ mark, onOpen }: { mark: GroupMark; onOpen: () => void }) {
  return (
    <button className="st-row" onClick={onOpen} type="button">
      <span className="st-row-label">アイコン</span>
      <span className="st-row-value pe-look-value">
        <span className="gr-mark-frame-small">
          <GroupIcon mark={mark} size={16} />
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="st-row-arrow" size={17} />
    </button>
  );
}
