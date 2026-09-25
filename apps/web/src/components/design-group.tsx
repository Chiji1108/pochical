import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Copy,
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
import { type ReactNode, useContext, useEffect, useState } from "react";
import type { DesignVariants } from "../lib/design-variants";
import {
  addDays,
  dateKey,
  formatDay,
  holidayName,
  monthDates,
  patterns,
  type Schedule,
  type Shift,
  type Tab,
  TabBar,
  timeRange,
  weekDates,
  weekendClassName,
} from "./design-calendar";
import { iconNames } from "./design-pattern-editor";
import {
  guessLook,
  type Look,
  lookOf,
  MarkGlyph,
  type MarkIcon,
  markColors,
  nextColor,
  type ShiftMarkStyle,
  ShiftMarkStyleContext,
} from "./shift-mark";

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
  // A profile picture; without one the avatar shows the first letter.
  photo?: string;
  patterns: MemberPattern[];
  shiftOn: (date: Date) => string | undefined;
};

type Group = {
  id: string;
  name: string;
  // Chosen by whoever made it; each member sees it in their own style.
  look: Look;
  members: Member[];
};

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
    name,
    time: extra.time,
    off: extra.off ?? false,
    look: {
      symbol: look.symbol ?? name.slice(0, 1),
      symbol2: look.symbol2 ?? name.slice(0, 2),
      icon: look.icon,
      emoji: look.emoji,
      color: look.color,
    },
  };
}

const restPattern = pattern(
  "off",
  "休み",
  { icon: "leaf", emoji: "🌿", color: "theme" },
  { off: true }
);

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

// Sample profile pictures: Unsplash photos served by picsum.photos.
export function samplePhoto(id: number) {
  return `https://picsum.photos/id/${id}/192/192`;
}

export const samplePhotoIds = [1011, 1025, 237, 429, 1062, 669, 823, 1005];

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
  photo: samplePhoto(1005),
  patterns: [
    pattern(
      "office",
      "出勤",
      { icon: "briefcase", emoji: "💼", color: 9 },
      { time: "9:00 – 18:00" }
    ),
    pattern(
      "home",
      "在宅",
      { icon: "house", emoji: "🏠", color: 10 },
      { time: "9:00 – 18:00" }
    ),
    restPattern,
  ],
  shiftOn: (date) => {
    if (isWeekend(date) || holidayName(date)) {
      return "off";
    }
    return date.getDay() === 3 ? "home" : "office";
  },
};

const mother: Member = {
  id: "mother",
  name: "お母さん",
  photo: samplePhoto(429),
  patterns: [
    pattern(
      "part",
      "パート",
      { icon: "shoppingBag", emoji: "🛒", color: 2 },
      { time: "10:00 – 15:00" }
    ),
    restPattern,
  ],
  shiftOn: (date) =>
    [1, 3, 5].includes(date.getDay()) && !holidayName(date) ? "part" : "off",
};

const nurseOrder = ["day", "day", "night", "after", "off", "off"] as const;

// Built on first use: this file and the calendar import each other, so
// the calendar's patterns are not ready while this module loads.
const misaki = (): Member => ({
  id: "misaki",
  name: "みさき",
  photo: samplePhoto(823),
  patterns: (["day", "night", "after", "off"] as Shift[]).map((key) => ({
    id: key,
    name: patterns[key].label,
    time: timeRange({ shift: key }),
    off: key === "off",
    look: lookOf(key),
  })),
  shiftOn: (date) => nurseOrder[(dayNumber(date) + 3) % nurseOrder.length],
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
      { icon: "cloudSun", emoji: "🌤️", color: 1 },
      { time: "7:00 – 16:00" }
    ),
    pattern(
      "late",
      "遅番",
      { icon: "sunset", emoji: "🌇", color: 5 },
      { time: "13:00 – 22:00" }
    ),
    pattern("lesson", "レッスン", { ...guessLook("レッスン"), color: 6 }),
    restPattern,
  ],
  shiftOn: (date) => {
    const order = ["early", "early", "late", "late", "off", "lesson", "off"];
    return order[(dayNumber(date) + 3) % order.length];
  },
});

// Nurses from the same year, each on the same order at a different point.
const classmates = (): Member[] =>
  [
    ["haruka", "はるか", 0, 1025],
    ["ren", "れん", 1, 237],
    ["mei", "めい", 2, 0],
    ["sota", "そうた", 4, 669],
    ["yui", "ゆい", 5, 1062],
  ].map(([id, name, offset, photo]) => ({
    ...misaki(),
    id: String(id),
    name: String(name),
    photo: photo ? samplePhoto(Number(photo)) : undefined,
    shiftOn: (date: Date) =>
      nurseOrder[(dayNumber(date) + Number(offset)) % nurseOrder.length],
  }));

function meFrom(
  schedule: Schedule,
  patternKeys: Shift[],
  photo?: string
): Member {
  return {
    id: "me",
    name: "自分",
    me: true,
    photo,
    patterns: patternKeys.map((key) => ({
      id: key,
      name: patterns[key].label,
      time: timeRange({ shift: key }),
      off: key === "off" || key === "paid",
      look: lookOf(key),
    })),
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
    unread: 2,
    messages: [
      {
        id: "f1",
        from: "mother",
        when: "昨日",
        time: "19:02",
        text: "来週の日曜、みんな休みみたいだからご飯行かない？",
        reactions: [{ emoji: "👍", by: ["yuki"] }],
      },
      {
        id: "f2",
        from: "yuki",
        when: "昨日",
        time: "19:10",
        text: "いいね！焼肉がいいな",
      },
      {
        id: "f3",
        from: "me",
        when: "今日",
        time: "8:15",
        days: [new Date(2026, 8, 27)],
        reactions: [{ emoji: "🎉", by: ["mother", "yuki"] }],
      },
      {
        id: "f4",
        from: "me",
        when: "今日",
        time: "8:15",
        text: "27日ならいけるよ！前の日が明けじゃないから元気なはず",
        replyTo: "f1",
      },
      {
        id: "f5",
        from: "mother",
        when: "今日",
        time: "9:40",
        text: "じゃあお店予約しとくね",
        reactions: [
          { emoji: "🙏", by: ["me"] },
          { emoji: "❤️", by: ["yuki"] },
        ],
      },
      {
        id: "f6",
        from: "yuki",
        when: "今日",
        time: "9:52",
        text: "何時にする？",
        replyTo: "f5",
      },
      {
        id: "f7",
        from: "mother",
        when: "今日",
        time: "10:03",
        text: "18時でどう？焼肉にしたよ",
        replyTo: "f6",
      },
    ],
  },
  "family:yuki": {
    unread: 0,
    messages: [
      {
        id: "y1",
        from: "yuki",
        when: "昨日",
        time: "22:31",
        text: "明日って夜勤だっけ？",
      },
      {
        id: "y2",
        from: "me",
        when: "昨日",
        time: "22:40",
        text: "ううん、明日は休み。夜ごはん作るね",
        replyTo: "y1",
        reactions: [{ emoji: "❤️", by: ["yuki"] }],
      },
    ],
  },
  "friends:group": {
    unread: 3,
    messages: [
      {
        id: "n1",
        from: "misaki",
        when: "今日",
        time: "12:05",
        days: [new Date(2026, 8, 14), new Date(2026, 8, 21)],
      },
      {
        id: "n2",
        from: "misaki",
        when: "今日",
        time: "12:05",
        text: "14日と21日、みんな休みじゃん！",
        reactions: [{ emoji: "😮", by: ["aya", "me"] }],
      },
      {
        id: "n3",
        from: "aya",
        when: "今日",
        time: "12:20",
        text: "21日カフェ行こ〜。14日はレッスンの後ならいける",
        replyTo: "n2",
      },
      {
        id: "n4",
        from: "misaki",
        when: "今日",
        time: "12:24",
        text: "21日にしよ！",
        replyTo: "n3",
        reactions: [{ emoji: "👍", by: ["aya"] }],
      },
    ],
  },
  "friends:misaki": {
    unread: 0,
    messages: [
      {
        id: "m1",
        from: "misaki",
        when: "月曜",
        time: "18:12",
        text: "来月の希望休、もう出した？",
      },
    ],
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
  | { name: "shifts"; month?: Date; from?: string }
  | { name: "chat"; chatId: string }
  | { name: "invite" }
  | { name: "new" };

export function DesignGroup({
  schedule,
  patternKeys,
  profile,
  variants,
  onTab,
}: {
  schedule: Schedule;
  patternKeys: Shift[];
  profile: Profile;
  variants: DesignVariants;
  onTab: (tab: Tab) => void;
}) {
  const me = meFrom(schedule, patternKeys, profile.photo);
  const [groups, setGroups] = useState<Omit<Group, "members">[]>([
    {
      id: "family",
      name: "家族",
      look: { ...guessGroupLook("家族"), color: 0 },
    },
    {
      id: "friends",
      name: "看護学校の友達",
      look: { ...guessGroupLook("看護学校の友達"), emoji: "🌷", color: 5 },
    },
    {
      id: "ward",
      name: "病棟の同期",
      look: {
        ...guessGroupLook("病棟の同期"),
        icon: "hospital",
        emoji: "🏥",
        color: 10,
      },
    },
  ]);
  const [groupId, setGroupId] = useState("family");
  const [chats, setChats] = useState(sampleChats);
  // The table layout each group was last seen in.
  const [layouts, setLayouts] = useState<Record<string, Layout>>({});
  const [page, setPage] = useState<Page>({ name: "hub" });
  const membersOf = (id: string): Member[] => {
    if (id === "family") {
      return [me, partner, mother];
    }
    if (id === "friends") {
      return [me, misaki(), aya()];
    }
    if (id === "ward") {
      return [me, ...classmates()];
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
        onBack={() => setPage({ name: "hub" })}
        onChange={(messages) =>
          setChats({ ...chats, [key]: { unread: 0, messages } })
        }
        onOpenDay={(date) =>
          setPage({
            name: "shifts",
            month: new Date(date.getFullYear(), date.getMonth(), 1),
            from: page.chatId,
          })
        }
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
            onNew={() => setPage({ name: "new" })}
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
                setPage({ name: "chat", chatId });
              }}
              onInvite={() => setPage({ name: "invite" })}
              onShifts={() => setPage({ name: "shifts" })}
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
              month={page.month}
              onBack={() =>
                setPage(
                  page.from
                    ? { name: "chat", chatId: page.from }
                    : { name: "hub" }
                )
              }
              onLayout={(layout) =>
                setLayouts({ ...layouts, [group.id]: layout })
              }
              view={variants.groupView}
            />
          )}
          {page.name === "invite" && (
            <InvitePage group={group} onBack={() => setPage({ name: "hub" })} />
          )}
          {page.name === "new" && (
            <NewGroupPage
              onBack={() => setPage({ name: "hub" })}
              onCreate={(created) => {
                const id = `group-${groups.length}`;
                setGroups([...groups, { ...created, id }]);
                setGroupId(id);
                setPage({ name: "invite" });
              }}
              usedColors={groups.map((item) => item.look.color)}
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
            onClick={() => onSelect(group.id)}
            type="button"
          >
            <span aria-hidden="true" className="gr-rail-icon">
              <GroupIcon look={group.look} size={24} />
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
  onChat,
  onInvite,
}: {
  group: Group;
  chatOf: (chatId: string) => Chat;
  onShifts: () => void;
  onChat: (chatId: string) => void;
  onInvite: () => void;
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
            <GroupIcon look={group.look} size={20} />
          </span>
          {group.name}
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
          type="button"
        >
          <Settings2 aria-hidden="true" size={18} />
        </button>
      </header>
      <button className="gr-week-card" onClick={onShifts} type="button">
        <span className="gr-week-card-head">
          今週のみんな
          <ChevronRight aria-hidden="true" size={16} />
        </span>
        <MemberTable compact dates={week} group={group} month={designToday} />
        {nextOff && (
          <span className="gr-week-card-next">
            次にみんな休み　{formatDay(nextOff)}
          </span>
        )}
      </button>
      <div className="st-list">
        <button className="st-row" onClick={onShifts} type="button">
          <CalendarDays aria-hidden="true" className="gr-row-icon" size={18} />
          <span className="st-row-label">シフト表</span>
          <span className="st-row-value" />
          <ChevronRight aria-hidden="true" className="st-row-arrow" size={17} />
        </button>
        <ChatRow
          chat={chatOf(groupChat)}
          icon={
            <MessagesSquare
              aria-hidden="true"
              className="gr-row-icon"
              size={18}
            />
          }
          label="全体チャット"
          members={group.members}
          onOpen={() => onChat(groupChat)}
        />
      </div>
      <section className="st-section">
        <h4>個人チャット</h4>
        {others.length > 0 ? (
          <div className="st-list">
            {others.map((member) => (
              <ChatRow
                chat={chatOf(member.id)}
                icon={<Avatar member={member} />}
                key={member.id}
                label={member.name}
                members={group.members}
                onOpen={() => onChat(member.id)}
              />
            ))}
          </div>
        ) : (
          <p className="st-note">
            メンバーを招待すると、ここで1対1で話せます。
          </p>
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
    return () => document.removeEventListener("pointerdown", close);
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
        id: `sent-${chat.messages.length}`,
        from: "me",
        when: "今日",
        time: "10:10",
        replyTo,
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
    setTimeout(() => setFlash(undefined), flashMilliseconds);
  };
  const toggleSelected = (id: string) =>
    setSelected(selected === id ? undefined : id);
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
                        onClick={() => toggleSelected(message.id)}
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
                            onClick={() => jumpTo(quoted.id)}
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
                          onClick={() => toggleSelected(message.id)}
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
                          onClick={() => react(message.id, reaction.emoji)}
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
                          onClick={() => react(message.id, emoji)}
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
            onClick={() => setReplyTo(undefined)}
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
          onClick={() => setSharing(true)}
          type="button"
        >
          <CalendarPlus aria-hidden="true" size={20} />
        </button>
        <input
          aria-label="メッセージ"
          onChange={(event) => setDraft(event.target.value)}
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
          onClose={() => setSharing(false)}
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
    return { ...message, reactions: [...reactions, { emoji, by: ["me"] }] };
  }
  const mine = existing.by.includes("me");
  const by = mine
    ? existing.by.filter((id) => id !== "me")
    : [...existing.by, "me"];
  return {
    ...message,
    reactions: reactions
      .map((reaction) => (reaction.emoji === emoji ? { emoji, by } : reaction))
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
            <span key={member.id}>
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
  const toggle = (date: Date) =>
    setPicked(
      isPicked(date)
        ? picked.filter((item) => dateKey(item) !== dateKey(date))
        : [...picked, date].sort((a, b) => a.getTime() - b.getTime())
    );
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
            onClick={() => onShare(picked)}
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
                onClick={() => toggle(date)}
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
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <strong aria-live="polite">
            {month.getFullYear()}年{month.getMonth() + 1}月
          </strong>
          <button
            aria-label="次の月"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
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
                onClick={() => toggle(date)}
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
            : "色のついた日は、みんな休みの日です。"}
        </p>
      </section>
    </div>
  );
}

const suggestionCount = 4;

// 週ごと reads the month at a glance and grows only downwards; 日ごと lists
// every day, which suits a few people best.
type Layout = "weeks" | "days";

function defaultLayout(count: number): Layout {
  return count <= namesUpTo ? "days" : "weeks";
}

function ShiftsPage({
  group,
  backLabel,
  view,
  month: initialMonth,
  layout,
  onLayout: setLayout,
  onBack,
}: {
  group: Group;
  backLabel: string;
  view: DesignVariants["groupView"];
  month?: Date;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onBack: () => void;
}) {
  const [month, setMonth] = useState(initialMonth ?? designMonth);
  const dates = monthDates(month);
  const offDays = dates.filter(
    (date) => sameMonth(date, month) && everyoneOff(group.members, date)
  );
  return (
    <>
      <header className="st-page-header">
        <div className="pe-topbar">
          <button className="st-back" onClick={onBack} type="button">
            <ChevronLeft aria-hidden="true" size={20} />
            {backLabel}
          </button>
          <fieldset className="design-segment st-row-segment gr-layout-toggle">
            <legend className="dc-sr-only">表の形</legend>
            <button
              aria-pressed={layout === "weeks"}
              onClick={() => setLayout("weeks")}
              type="button"
            >
              週ごと
            </button>
            <button
              aria-pressed={layout === "days"}
              onClick={() => setLayout("days")}
              type="button"
            >
              日ごと
            </button>
          </fieldset>
        </div>
        <h3 className="st-title">シフト表</h3>
      </header>
      <div className="gr-month">
        <button
          aria-label="前の月"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <strong aria-live="polite">
          {month.getFullYear()}年{month.getMonth() + 1}月
        </strong>
        <button
          aria-label="次の月"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="gr-together">
        <span className="gr-together-label">みんな休み</span>
        {offDays.length > 0 ? (
          offDays.map((date) => (
            <span className="gr-together-day" key={dateKey(date)}>
              {date.getDate()}日
            </span>
          ))
        ) : (
          <span className="gr-together-none">今月はありません</span>
        )}
      </div>
      {layout === "days" && <DayRowsTable group={group} month={month} />}
      {layout === "weeks" && view === "table" && (
        <MemberTable dates={dates} group={group} month={month} />
      )}
      {layout === "weeks" && view === "overlay" && (
        <OverlayCalendar dates={dates} group={group} month={month} />
      )}
      {layout === "weeks" && view === "person" && (
        <PersonCalendar dates={dates} group={group} month={month} />
      )}
      {layout === "weeks" && view !== "person" && (
        <Legend members={group.members} />
      )}
    </>
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
function DayRowsTable({ group, month }: { group: Group; month: Date }) {
  const style = useContext(ShiftMarkStyleContext);
  const days = monthDates(month).filter((date) => sameMonth(date, month));
  const density = densityOf(group.members.length);
  const withNames = density === "names";
  const [picked, setPicked] = useState(designToday);
  const columnWidth = withNames ? rowsMemberWidth : rowsMarkWidth;
  return (
    <>
      <div className="gr-rows-scroll">
        <table
          className={`gr-rows gr-density-${density}`}
          style={{
            minWidth: rowsDateWidth + group.members.length * columnWidth,
          }}
        >
          <caption className="dc-sr-only">
            {month.getMonth() + 1}月のみんなのシフト
          </caption>
          <thead>
            <tr>
              <th className="gr-rows-corner" scope="col">
                <span className="dc-sr-only">日付</span>
              </th>
              {group.members.map((member) => (
                <th
                  className={member.me ? "gr-rows-me" : ""}
                  key={member.id}
                  scope="col"
                >
                  <span className="gr-rows-member">
                    <Avatar member={member} />
                    {withNames ? (
                      member.name
                    ) : (
                      <span className="dc-sr-only">{member.name}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((date) => {
              const together = everyoneOff(group.members, date);
              const today = dateKey(date) === dateKey(designToday);
              const chosen = !withNames && dateKey(date) === dateKey(picked);
              return (
                <tr
                  className={`${together ? "gr-together-cell" : ""} ${today ? "gr-rows-today" : ""} ${chosen ? "gr-rows-picked" : ""}`}
                  key={dateKey(date)}
                >
                  <th className="gr-rows-date" scope="row">
                    <RowDate
                      date={date}
                      onPick={withNames ? undefined : () => setPicked(date)}
                      picked={chosen}
                    />
                    {together && <span className="dc-sr-only">みんな休み</span>}
                  </th>
                  {group.members.map((member) => {
                    const item = patternOn(member, date);
                    return (
                      <td
                        className={member.me ? "gr-rows-me" : ""}
                        key={member.id}
                      >
                        {item ? (
                          <span className="gr-rows-cell">
                            <MarkGlyph
                              look={item.look}
                              size={16}
                              style={style}
                            />
                            <span
                              className={
                                withNames ? "gr-rows-name" : "dc-sr-only"
                              }
                            >
                              {item.name}
                            </span>
                          </span>
                        ) : (
                          <span className="gr-rows-empty">
                            {withNames ? "未入力" : "・"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!withNames && (
        <>
          <p className="st-note">
            日付を押すと、その日のみんなの予定が出ます。
          </p>
          <DayList date={picked} members={group.members} />
          <Legend members={group.members} />
        </>
      )}
    </>
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
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
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

function Mark({
  member,
  date,
  size,
}: {
  member: Member;
  date: Date;
  size: number;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const item = patternOn(member, date);
  if (!item) {
    return <span aria-hidden="true" className="gr-empty" />;
  }
  return <MarkGlyph look={item.look} size={size} style={style} />;
}

// A block per week: dates across, one row per member underneath.
function MemberTable({
  group,
  dates,
  month,
  compact = false,
}: {
  group: Group;
  dates: Date[];
  month: Date;
  // A single week inside a card, without its own frame.
  compact?: boolean;
}) {
  const weeks = Array.from({ length: dates.length / weekLength }, (_, row) =>
    dates.slice(row * weekLength, (row + 1) * weekLength)
  );
  return (
    <div className={`gr-table ${compact ? "gr-table-compact" : ""}`}>
      <div aria-hidden="true" className="gr-table-row gr-table-weekdays">
        <span />
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
              <span
                className={`gr-table-date gr-date ${weekendClassName(date)} ${sameMonth(date, month) ? "" : "gr-outside"} ${everyoneOff(group.members, date) ? "gr-together-cell" : ""}`}
                key={dateKey(date)}
              >
                {date.getDate()}
              </span>
            ))}
          </div>
          {group.members.map((member) => (
            <div className="gr-table-row" key={member.id}>
              <span className="gr-table-name">
                <Avatar member={member} />
                <span className="dc-sr-only">{member.name}</span>
              </span>
              {week.map((date) => (
                <span
                  aria-label={`${formatDay(date)} ${member.name}：${patternOn(member, date)?.name ?? "未入力"}`}
                  className={`gr-table-cell ${sameMonth(date, month) ? "" : "gr-outside"} ${everyoneOff(group.members, date) ? "gr-together-cell" : ""}`}
                  key={dateKey(date)}
                  role="img"
                >
                  <Mark date={date} member={member} size={18} />
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

// One month with everyone's marks in each day; picking a day lists them
// with names and times.
function OverlayCalendar({
  group,
  dates,
  month,
}: {
  group: Group;
  dates: Date[];
  month: Date;
}) {
  const [picked, setPicked] = useState(() => new Date(2026, 8, 24));
  return (
    <>
      <div aria-hidden="true" className="dc-weekdays gr-weekdays">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="gr-overlay">
        {dates.map((date) => {
          const outside = !sameMonth(date, month);
          const together = !outside && everyoneOff(group.members, date);
          return (
            <button
              aria-label={`${formatDay(date)}${together ? "、みんな休み" : ""}`}
              aria-pressed={dateKey(date) === dateKey(picked)}
              className={`gr-overlay-day ${outside ? "gr-outside" : ""} ${together ? "gr-together-cell" : ""}`}
              disabled={outside}
              key={dateKey(date)}
              onClick={() => setPicked(date)}
              type="button"
            >
              <span
                className={`gr-overlay-date gr-date ${weekendClassName(date)}`}
              >
                {date.getDate()}
              </span>
              {!outside && (
                <span className="gr-overlay-marks">
                  {group.members.map((member) => (
                    <Mark
                      date={date}
                      key={member.id}
                      member={member}
                      size={13}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <DayList date={picked} members={group.members} />
    </>
  );
}

function DayList({ date, members }: { date: Date; members: Member[] }) {
  const style = useContext(ShiftMarkStyleContext);
  return (
    <section className="st-section">
      <h4>{formatDay(date)}</h4>
      <div className="st-list">
        {members.map((member) => {
          const item = patternOn(member, date);
          return (
            <div className="st-row" key={member.id}>
              <Avatar member={member} />
              <span className="st-row-label">{member.name}</span>
              <span className="st-row-value gr-day-value">
                {item && <MarkGlyph look={item.look} size={18} style={style} />}
                {item ? item.name : "未入力"}
                {item?.time && (
                  <small className="gr-day-time">{item.time}</small>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// One member at a time, in the same kind of calendar as your own.
function PersonCalendar({
  group,
  dates,
  month,
}: {
  group: Group;
  dates: Date[];
  month: Date;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [memberId, setMemberId] = useState(
    group.members.find((member) => !member.me)?.id ?? group.members[0].id
  );
  const member =
    group.members.find((item) => item.id === memberId) ?? group.members[0];
  const me = group.members.find((item) => item.me);
  return (
    <>
      <fieldset className="gr-people">
        <legend className="dc-sr-only">表示する人</legend>
        {group.members.map((item) => (
          <button
            aria-pressed={item.id === member.id}
            key={item.id}
            onClick={() => setMemberId(item.id)}
            type="button"
          >
            <Avatar member={item} />
            {item.name}
          </button>
        ))}
      </fieldset>
      <div aria-hidden="true" className="dc-weekdays gr-weekdays">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="gr-person">
        {dates.map((date) => {
          const outside = !sameMonth(date, month);
          const item = outside ? undefined : patternOn(member, date);
          const withMe =
            !(outside || member.me) &&
            me !== undefined &&
            everyoneOff([me, member], date);
          return (
            <div
              aria-label={`${formatDay(date)}：${item?.name ?? "未入力"}${withMe ? "、自分も休み" : ""}`}
              className={`gr-person-day ${outside ? "gr-outside" : ""} ${withMe ? "gr-together-cell" : ""}`}
              key={dateKey(date)}
              role="img"
            >
              <span
                className={`gr-overlay-date gr-date ${weekendClassName(date)}`}
              >
                {date.getDate()}
              </span>
              {item && <MarkGlyph look={item.look} size={22} style={style} />}
            </div>
          );
        })}
      </div>
      {!member.me && (
        <p className="st-note">色がついた日は、自分も休みの日です。</p>
      )}
      <Legend members={[member]} />
    </>
  );
}

// What each mark means, in the viewer's style, per member.
function Legend({ members }: { members: Member[] }) {
  const style = useContext(ShiftMarkStyleContext);
  return (
    <section className="st-section">
      <h4>マークの意味</h4>
      <div className="st-list">
        {members.map((member) => (
          <div className="st-row gr-legend-row" key={member.id}>
            <Avatar member={member} />
            <span className="gr-legend">
              {member.patterns.map((item) => (
                <span className="gr-legend-item" key={item.id}>
                  <MarkGlyph look={item.look} size={16} style={style} />
                  {item.name}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
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

// Marks a group from its name. An unknown name gets no emoji, so the emoji
// style shows its first letters instead of a mark that means nothing.
const groupHints: { words: string[]; icon: MarkIcon; emoji: string }[] = [
  { words: ["家族", "家", "夫婦"], icon: "house", emoji: "🏠" },
  {
    words: ["学校", "同期", "クラス", "ゼミ"],
    icon: "graduationCap",
    emoji: "🎓",
  },
  { words: ["職場", "会社", "仕事", "病棟"], icon: "briefcase", emoji: "💼" },
  { words: ["旅行", "旅"], icon: "plane", emoji: "✈️" },
  { words: ["ごはん", "飲み", "ランチ"], icon: "utensils", emoji: "🍙" },
  { words: ["友達", "友だち", "仲間"], icon: "users", emoji: "👭" },
];

function guessGroupLook(name: string): Omit<Look, "color"> {
  const hint = groupHints.find(({ words }) =>
    words.some((word) => name.includes(word))
  );
  const letters = Array.from(name.trim());
  return {
    symbol: letters[0] ?? "",
    symbol2: letters.slice(0, 2).join(""),
    icon: hint?.icon ?? "letter",
    emoji: hint?.emoji ?? "",
  };
}

// A group's mark in a given style, falling back to its letters when it has
// no emoji.
function GroupIcon({
  look,
  size,
  style,
}: {
  look: Look;
  size: number;
  style?: ShiftMarkStyle;
}) {
  const viewerStyle = useContext(ShiftMarkStyleContext);
  const shown = style ?? viewerStyle;
  return (
    <MarkGlyph
      look={look}
      size={size}
      style={shown === "emoji" && !look.emoji ? "badge" : shown}
    />
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

type GroupLookField = "icon" | "emoji";

function NewGroupPage({
  usedColors,
  onBack,
  onCreate,
}: {
  usedColors: Look["color"][];
  onBack: () => void;
  onCreate: (group: { name: string; look: Look }) => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [name, setName] = useState("");
  const [myName, setMyName] = useState("");
  const [look, setLook] = useState<Look>(() => ({
    ...guessGroupLook(""),
    color: nextColor(usedColors),
  }));
  // Marks the person picked stay when the name changes afterwards.
  const [picked, setPicked] = useState<GroupLookField[]>([]);
  const rename = (value: string) => {
    const guess = guessGroupLook(value);
    setName(value);
    setLook({
      ...look,
      symbol: guess.symbol,
      symbol2: guess.symbol2,
      icon: picked.includes("icon") ? look.icon : guess.icon,
      emoji: picked.includes("emoji") ? look.emoji : guess.emoji,
    });
  };
  const pick = (field: GroupLookField, value: Partial<Look>) => {
    setLook({ ...look, ...value });
    setPicked(picked.includes(field) ? picked : [...picked, field]);
  };
  const canCreate = name.trim() !== "" && myName.trim() !== "";
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
            onClick={() => onCreate({ name: name.trim(), look })}
            type="button"
          >
            作る
          </button>
        </div>
        <h3 className="st-title">グループを作る</h3>
      </header>
      <div className="gr-new-icon">
        <span className="gr-rail-icon gr-new-preview">
          <GroupIcon look={look} size={30} />
        </span>
      </div>
      <div className="st-list">
        <label className="st-row">
          <span className="st-row-label">グループ名</span>
          <input
            className="pe-inline-input"
            onChange={(event) => rename(event.target.value)}
            placeholder="例：家族"
            value={name}
          />
        </label>
        <label className="st-row">
          <span className="st-row-label">あなたの名前</span>
          <input
            className="pe-inline-input"
            onChange={(event) => setMyName(event.target.value)}
            placeholder="例：さくら"
            value={myName}
          />
        </label>
      </div>
      <p className="st-note">
        あなたの名前は、このグループの中だけで使われます。
      </p>
      <section className="st-section">
        <h4>{style === "emoji" ? "絵文字" : "アイコン"}</h4>
        {style === "icon" && (
          <fieldset className="gr-icon-choices">
            <legend className="dc-sr-only">アイコン</legend>
            {groupIcons.map((icon) => (
              <button
                aria-label={iconNames[icon]}
                aria-pressed={look.icon === icon}
                key={icon}
                onClick={() => pick("icon", { icon })}
                type="button"
              >
                <MarkGlyph look={{ ...look, icon }} size={22} style="icon" />
              </button>
            ))}
          </fieldset>
        )}
        {style === "emoji" && (
          <fieldset className="gr-icon-choices">
            <legend className="dc-sr-only">絵文字</legend>
            {groupEmojis.map((emoji) => (
              <button
                aria-pressed={look.emoji === emoji}
                key={emoji}
                onClick={() => pick("emoji", { emoji })}
                type="button"
              >
                <MarkGlyph look={{ ...look, emoji }} size={22} style="emoji" />
              </button>
            ))}
          </fieldset>
        )}
        {style === "badge" && (
          <p className="st-note">
            文字のスタイルでは、グループ名の頭文字が入ります。
          </p>
        )}
      </section>
      <section className="st-section">
        <h4>色</h4>
        <fieldset className="gr-colors">
          <legend className="dc-sr-only">色</legend>
          {markColors.map(({ name: colorName, color, tint }, index) => (
            <button
              aria-label={colorName}
              aria-pressed={look.color === index}
              key={colorName}
              onClick={() => setLook({ ...look, color: index })}
              style={{ background: tint, color }}
              type="button"
            />
          ))}
        </fieldset>
      </section>
      <section className="st-section">
        <h4>ほかのスタイルの人には</h4>
        <div className="gr-other-looks">
          {(
            [
              ["icon", "アイコン"],
              ["emoji", "絵文字"],
              ["badge", "文字"],
            ] as const
          ).map(([option, label]) => (
            <span className="gr-other-look" key={option}>
              <span className="gr-rail-icon">
                <GroupIcon look={look} size={22} style={option} />
              </span>
              <small>{label}</small>
            </span>
          ))}
        </div>
        <p className="st-note">
          メンバーには、それぞれが選んだスタイルで表示されます。選んでいない見た目は、グループ名から自動で決まります。
        </p>
      </section>
    </>
  );
}
