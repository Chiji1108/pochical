import { Popover, Portal } from "@ark-ui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CalendarPlus,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ImageIcon,
  Info,
  MessageCircle,
  MessagesSquare,
  Plus,
  QrCode,
  Reply,
  RotateCcw,
  ScanLine,
  Send,
  SendHorizontal,
  Settings2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactElement, ReactNode, Ref } from "react";
import { css, cva, cx } from "styled-system/css";

import { patterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { useUser } from "../lib/design-user-store";
import type { DesignVariants } from "../lib/design-variants";
import {
  TabBar,
  addDays,
  dateKey,
  dayCell,
  dayParts,
  formatDay,
  timeChangeOf,
  timeRange,
} from "./design-calendar";
import type { Schedule, Tab } from "./design-calendar";
import { EmojiPickerSheet } from "./design-emoji-picker";
import { iconNames, OtherEmojiButton, withPicked } from "./design-look-editor";
import { MonthTitleButton } from "./design-month-picker";
import {
  ConfirmDialog,
  DecideHeading,
  PhoneContext,
  PhotoViewer,
  Sheet,
  SheetHeading,
  sheetBody,
} from "./design-sheet";
import { ThemeContext, themeOfColor } from "./design-theme";
import type { ColorChoice } from "./design-theme";
import { ToastContext } from "./design-toast";
import {
  BackButton,
  Button,
  Choice,
  ChoiceGrid,
  colorGrid,
  dayGrid,
  DestructiveButton,
  fieldLabel,
  HeaderAction,
  IconButton,
  inlineInput,
  List,
  ListRow,
  listRow,
  markGrid,
  markValue,
  MenuItem,
  MenuPicker,
  MenuSeparator,
  menuStyle,
  Note,
  PageHeader,
  Pager,
  PullDownMenu,
  pushToBottom,
  Screen,
  ScreenScroll,
  Section,
  sectionTitle,
  Segment,
  SegmentedControl,
  srOnly,
  SummaryRow,
  summaryRow,
  Tag,
  TodayButton,
  WeekdayRow,
} from "./design-ui";
import { holidayName, useWeek } from "./design-week";
import type { DayTone } from "./design-week";
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
  // 早出 and 残業, shared with the group like the shift itself, with the
  // day's actual hours.
  changeOn?: (date: Date) => TimeChange | undefined;
};

type TimeChange = { early: boolean; late: boolean; time: string };

function changeOn(member: Member, date: Date) {
  return member.changeOn?.(date);
}

export type Group = {
  id: string;
  name: string;
  mark: GroupMark;
  // How you appear in this group, when it differs from your usual profile.
  mine?: GroupProfile;
  members: Member[];
};

// `noPhoto` hides the usual picture in this group without choosing another.
export type GroupProfile = { name?: string; photo?: string; noPhoto?: boolean };

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
const designMonth = new Date(2026, 8, 1);
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
  // Large enough to look at on its own, not only as a small avatar.
  return `https://picsum.photos/id/${id}/512/512`;
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
  // Fridays run on until 17:00.
  changeOn: (date) =>
    date.getDay() === 5 && !holidayName(date)
      ? { early: false, late: true, time: "10:00 – 17:00" }
      : undefined,
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
  // Now and then a 日勤 runs late or starts early.
  changeOn: (date) => {
    const shift = nurseOrder[(dayNumber(date) + 3) % nurseOrder.length];
    if (shift !== "day") {
      return;
    }
    if (dayNumber(date) % 5 === 0) {
      return { early: false, late: true, time: "9:00 – 20:00" };
    }
    if (dayNumber(date) % 7 === 0) {
      return { early: true, late: false, time: "8:00 – 18:00" };
    }
  },
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

// The cousins' group the sample invitation is for; ゆうき, who sent it,
// is the same person as in 家族.
const cousins = (): Member[] => [
  partner,
  {
    ...misaki(),
    id: "akari",
    name: "あかり",
    photo: undefined,
    shiftOn: (date: Date) =>
      nurseOrder[(dayNumber(date) + 1) % nurseOrder.length],
    style: { look: presetLook("pop") },
  },
  {
    ...mother,
    id: "cousin-riku",
    name: "りく",
    photo: undefined,
    style: { look: presetLook("minimal") },
  },
];

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
    changeOn: (date) => {
      const entry = schedule[dateKey(date)];
      const change = timeChangeOf(entry);
      return change && entry && { ...change, time: timeRange(entry) ?? "" };
    },
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
// `replyTo` quotes an earlier line; `notice` is a line from the app about
// the group, such as a new name, shown between the messages.
type Message = {
  id: string;
  from: string;
  when: string;
  time: string;
  text?: string;
  notice?: string;
  days?: Date[];
  replyTo?: string;
  reactions?: Reaction[];
};

type Reaction = { emoji: string; by: string[] };

export type Chat = { messages: Message[]; unread: number };

const groupChat = "group";

const reactionChoices = ["👍", "❤️", "😂", "😮", "🙏", "🎉"];

export const sampleChats: Record<string, Chat> = {
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
    unread: 1,
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
  // `from` is the chat whose member picture opened it, to go back there.
  | { name: "chat"; chatId: string; from?: string }
  | { name: "invite" }
  | { name: "new" }
  | { name: "settings" }
  // Reading a group's QR code to join it.
  | { name: "scan" };

// A group as the list keeps it, without its members' shifts.
export type GroupSummary = Omit<Group, "members">;

// The groups the sample person is in.
export function sampleGroups(): GroupSummary[] {
  return [
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
  ];
}

export function DesignGroup({
  schedule,
  patternKeys,
  profile,
  onTab,
  initialGroupId = "family",
  scanResult = "invite",
  monthNav = "arrows",
}: {
  schedule: Schedule;
  patternKeys: Shift[];
  profile: Profile;
  // The group to open on, like one just joined from a link.
  initialGroupId?: string;
  // What the QR page finds, as 比べる案 sets it.
  scanResult?: ScanResult;
  // How the shift table moves between months, as 比べる案 sets it.
  monthNav?: MonthNav;

  onTab: (tab: Tab) => void;
}) {
  const groups = useUser((state) => state.groups);
  const setGroups = useUser((state) => state.setGroups);
  const [groupId, setGroupId] = useState(initialGroupId);
  const chats = useUser((state) => state.chats);
  const setChats = useUser((state) => state.setChats);
  // The table layout each group was last seen in.
  const [layouts, setLayouts] = useState<Record<string, Layout>>({});
  const [page, setPage] = useState<Page>({ name: "hub" });

  // The member whose profile sheet is open.
  const [profileOf, setProfileOf] = useState<Member>();
  // Members taken out of each group, by group id.
  const [removed, setRemoved] = useState<Record<string, string[]>>({});
  // Each QR code read opens a fresh invitation.
  const [scans, setScans] = useState(0);
  const toast = useContext(ToastContext);
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
    if (id === invitedGroupId) {
      return [me, ...cousins()];
    }
    return [me];
  };
  const scanPage = (
    <ScanPage
      onClose={() => {
        setPage({ name: "hub" });
      }}
      result={scanResult}
      onRead={() => {
        setPage({ name: "hub" });
        const invited = sampleInvite().group;
        if (groups.some((item) => item.id === invitedGroupId)) {
          setGroupId(invitedGroupId);
          toast(`「${invited}」にはもう参加しています`);
        } else {
          setScans(scans + 1);
        }
      }}
    />
  );
  const joinSheet = scans > 0 && (
    <JoinSheet
      afterScan
      key={scans}
      name={profile.name}
      onOpenGroup={(id) => {
        setGroupId(id);
        setPage({ name: "hub" });
        toast(`「${sampleInvite().group}」に参加しました`);
      }}
    />
  );
  const onScan = () => {
    setPage({ name: "scan" });
  };

  const newGroupPage = (
    <NewGroupPage
      onBack={() => {
        setPage({ name: "hub" });
      }}
      onCreate={({ myName, ...created }) => {
        const id = `group-${groups.length}`;
        const mine = myName === profile.name ? undefined : { name: myName };
        setGroups([...groups, { ...created, id, mine }]);
        setGroupId(id);
        setPage({ name: "invite" });
      }}
      profile={profile}
      usedColors={groups.map((item) => colorOfMark(item.mark))}
    />
  );

  // In no group yet, or none left: what sharing looks like, and the two
  // ways in.
  if (groups.length === 0) {
    if (page.name === "scan") {
      return scanPage;
    }
    return (
      <Screen>
        <ScreenScroll>
          {page.name === "new" ? (
            newGroupPage
          ) : (
            <NoGroups
              onNew={() => {
                setPage({ name: "new" });
              }}
              onScan={onScan}
            />
          )}
        </ScreenScroll>
        {page.name !== "new" && <TabBar active="group" onSelect={onTab} />}
        {joinSheet}
      </Screen>
    );
  }

  const summary = groups.find((item) => item.id === groupId) ?? groups[0];
  const group: Group = {
    ...summary,
    members: membersOf(summary.id).filter(
      (member) => !removed[summary.id]?.includes(member.id)
    ),
  };
  const chatOf = (id: string, chatId: string): Chat =>
    chats[chatKey(id, chatId)] ?? { messages: [], unread: 0 };
  // A line from the app in the group chat, like a new name.
  const addNotice = (notice: string) => {
    const key = chatKey(group.id, groupChat);
    const chat = chatOf(group.id, groupChat);
    setChats({
      ...chats,
      [key]: {
        ...chat,
        messages: [
          ...chat.messages,
          {
            from: "me",
            id: `notice-${chat.messages.length}`,
            notice,
            time: timeNow(),
            when: "今日",
          },
        ],
      },
    });
  };
  const removeMember = (member: Member) => {
    setProfileOf(undefined);
    setRemoved({
      ...removed,
      [group.id]: [...(removed[group.id] ?? []), member.id],
    });
    addNotice(
      `${profileIn(group, profile).name}が${member.name}をグループから外しました`
    );
    toast(`${member.name}を外しました`);
  };
  const openChat = (chatId: string, from?: string) => {
    setProfileOf(undefined);
    setChats({
      ...chats,
      [chatKey(group.id, chatId)]: { ...chatOf(group.id, chatId), unread: 0 },
    });
    setPage({ chatId, from, name: "chat" });
  };
  // Tapping a member opens their profile, where a one-to-one chat starts.
  const onMember = (member: Member) => {
    if (!member.me) {
      setProfileOf(member);
    }
  };
  const memberSheet = (
    <MemberSheet
      group={group}
      member={profileOf}
      onClose={() => {
        setProfileOf(undefined);
      }}
      onRemove={page.name === "settings" ? removeMember : undefined}
      onMessage={
        // Already in the one-to-one chat with them: nothing to open.
        page.name === "chat" && page.chatId === profileOf?.id
          ? undefined
          : (member) => {
              openChat(
                member.id,
                page.name === "chat" ? page.chatId : undefined
              );
            }
      }
    />
  );

  const unreadOf = (id: string) =>
    Object.entries(chats)
      .filter(([key]) => key.startsWith(`${id}:`))
      .reduce((total, [, chat]) => total + chat.unread, 0);

  if (page.name === "scan") {
    return scanPage;
  }

  if (page.name === "chat") {
    const key = chatKey(group.id, page.chatId);
    return (
      <>
        <ChatPage
          backLabel={page.from ? chatTitle(group, page.from) : group.name}
          chat={chatOf(group.id, page.chatId)}
          formerMembers={membersOf(group.id).filter((member) =>
            removed[group.id]?.includes(member.id)
          )}
          group={group}
          onMember={onMember}
          onBack={() => {
            setPage(
              page.from ? { chatId: page.from, name: "chat" } : { name: "hub" }
            );
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
        {memberSheet}
      </>
    );
  }

  return (
    <Screen>
      {page.name === "hub" ? (
        <div className={hub.layout}>
          <GroupRail
            groups={groups}
            onNew={() => {
              setPage({ name: "new" });
            }}
            onScan={onScan}
            onSelect={setGroupId}
            selected={group.id}
            unreadOf={unreadOf}
          />
          <ScreenScroll beside>
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
          </ScreenScroll>
        </div>
      ) : (
        <ScreenScroll>
          {page.name === "shifts" && (
            <ShiftsPage
              backLabel={page.from ? chatTitle(group, page.from) : group.name}
              group={group}
              layout={layouts[group.id] ?? defaultLayout(group.members.length)}
              day={page.day}
              month={page.month}
              monthNav={monthNav}
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
              onLeave={() => {
                const rest = groups.filter((item) => item.id !== group.id);
                setGroups(rest);
                if (rest.length > 0) {
                  setGroupId(rest[0].id);
                }
                setPage({ name: "hub" });
                toast(`「${group.name}」から抜けました`);
              }}
              onMember={onMember}
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
              onEdit={(edit) => {
                setGroups(
                  groups.map((item) =>
                    item.id === group.id ? { ...item, ...edit } : item
                  )
                );
                const notice = editNotice(
                  profileIn(group, profile).name,
                  group,
                  edit
                );
                addNotice(notice);
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
          {page.name === "new" && newGroupPage}
        </ScreenScroll>
      )}
      {page.name === "hub" && <TabBar active="group" onSelect={onTab} />}
      {memberSheet}
      {joinSheet}
    </Screen>
  );
}

// Reading a group's QR code, as the camera shows it. The prototype has no
// camera: pressing the frame, or 写真から読み取る, reads the sample code.
function ScanPage({
  result,
  onClose,
  onRead,
}: {
  result: ScanResult;
  onClose: () => void;
  onRead: () => void;
}) {
  const [expired, setExpired] = useState(false);
  const toast = useContext(ToastContext);
  const read = (from: "camera" | "photo") => {
    if (result === "invite") {
      onRead();
      return;
    }
    // An invitation that no longer works needs a new code from whoever
    // sent it, so that stays on screen; the rest just need another try.
    if (result === "expired") {
      setExpired(true);
      return;
    }
    // The camera only reports codes it finds; with none in view it keeps
    // looking, as camera apps do.
    if (result === "none" && from === "camera") {
      return;
    }
    toast(scanRetries[result], "problem");
  };
  return (
    <Screen className={scan.root} data-toast-above="">
      <header className={scan.header}>
        <button
          aria-label="閉じる"
          className={scan.close}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={20} />
        </button>
        <h3 className={scan.title}>QRコードで参加</h3>
      </header>
      {expired && (
        <p className={scan.problem} role="alert">
          <CircleAlert aria-hidden="true" size={18} />
          この招待は使えなくなっています。招待した人に、新しいQRコードを見せてもらってください。
        </p>
      )}
      <div className={scan.body}>
        <button
          aria-label="QRコードを読み取る（デモ）"
          className={scan.frame}
          onClick={() => {
            read("camera");
          }}
          type="button"
        >
          <span aria-hidden="true" className={scan.corners} />
        </button>
        <p className={scan.hint}>
          グループの招待QRコードを枠に合わせてください
        </p>
        <small className={scan.demo}>デモでは枠を押すと読み取れます</small>
      </div>
      <button
        className={scan.library}
        onClick={() => {
          read("photo");
        }}
        type="button"
      >
        <ImageIcon aria-hidden="true" size={18} />
        写真から読み取る
      </button>
    </Screen>
  );
}

type ScanResult = "invite" | "other" | "expired" | "none";

// What the QR page says, briefly, when another try is all it takes.
const scanRetries: Record<"other" | "none", string> = {
  none: "写真にQRコードが見つかりませんでした",
  other: "ポチカルの招待QRコードではありません",
};

const scanCorner = "3px solid white";

const scan = {
  body: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "20px",
    justifyContent: "center",
  }),
  close: css({
    bg: "rgba(255, 255, 255, 0.16)",
    border: 0,
    borderRadius: "50%",
    color: "white",
    display: "grid",
    height: "action",
    placeItems: "center",
    width: "action",
  }),
  // Four corner marks, drawn by the frame's own corners.
  corners: css({
    _after: {
      borderBottom: scanCorner,
      borderLeft: scanCorner,
      bottom: 0,
      content: '""',
      height: "32px",
      left: 0,
      position: "absolute",
      width: "32px",
    },
    _before: {
      borderLeft: scanCorner,
      borderTop: scanCorner,
      content: '""',
      height: "32px",
      left: 0,
      position: "absolute",
      top: 0,
      width: "32px",
    },
    inset: 0,
    position: "absolute",
  }),
  demo: css({ color: "rgba(255, 255, 255, 0.45)", textStyle: "caption" }),
  frame: css({
    _after: {
      borderBottom: scanCorner,
      borderRight: scanCorner,
      bottom: 0,
      content: '""',
      height: "32px",
      position: "absolute",
      right: 0,
      width: "32px",
    },
    _before: {
      borderRight: scanCorner,
      borderTop: scanCorner,
      content: '""',
      height: "32px",
      position: "absolute",
      right: 0,
      top: 0,
      width: "32px",
    },
    bg: "rgba(255, 255, 255, 0.06)",
    border: 0,
    borderRadius: "12px",
    height: "220px",
    position: "relative",
    width: "220px",
  }),
  header: css({ alignItems: "center", display: "flex", gap: "12px" }),
  hint: css({ margin: 0, textAlign: "center", textStyle: "body" }),
  library: css({
    alignItems: "center",
    alignSelf: "center",
    bg: "rgba(255, 255, 255, 0.16)",
    border: 0,
    borderRadius: "999px",
    color: "white",
    display: "flex",
    fontWeight: 600,
    gap: "8px",
    marginBottom: "12px",
    padding: "12px 20px",
    textStyle: "body",
  }),
  problem: css({
    "& svg": { color: "#ffd60a", flexShrink: 0, marginTop: "1px" },
    alignItems: "flex-start",
    bg: "rgba(255, 255, 255, 0.14)",
    borderRadius: "16px",
    display: "flex",
    gap: "12px",
    lineHeight: 1.5,
    margin: "16px 0 0",
    padding: "12px 16px",
    textStyle: "subheadline",
  }),
  root: css({ bg: "black", color: "white" }),
  title: css({ fontWeight: 600, margin: 0, textStyle: "headline" }),
};

// A made-up group for the no-group screen's picture of sharing.
const sampleGroup = (): Group => ({
  id: "sample",
  mark: { emoji: "🏠", kind: "emoji" },
  members: [partner, mother, misaki()],
  name: "サンプル",
});

// No group yet: a sample week of shared shifts, then 作成 and QR参加, as
// the old app showed it.
function NoGroups({
  onNew,
  onScan,
}: {
  onNew: () => void;
  onScan: () => void;
}) {
  const weekTools = useWeek();
  return (
    <div className={noGroups.root}>
      <h3 className={noGroups.title}>グループでシフトを共有できます</h3>
      <div
        aria-label="サンプルの共有シフト表"
        className={hub.weekCard}
        role="img"
      >
        <MemberTable
          compact
          dates={weekTools.weekDates(designToday)}
          group={sampleGroup()}
          month={designToday}
        />
      </div>
      <p className={noGroups.note}>
        家族や友達とシフトを見せ合って、休みが重なる日がすぐ分かります。
      </p>
      <div className={noGroups.actions}>
        <Button onClick={onNew}>
          <Plus aria-hidden="true" size={18} />
          グループを作成
        </Button>
        <Button onClick={onScan} variant="quiet">
          <ScanLine aria-hidden="true" size={17} />
          QRコードで参加
        </Button>
      </div>
    </div>
  );
}

const noGroups = {
  actions: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  note: css({
    color: "text3",
    lineHeight: 1.6,
    margin: 0,
    textAlign: "center",
    textStyle: "subheadline",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    margin: "auto 0",
    paddingBlock: "24px",
  }),
  title: css({
    fontWeight: 700,
    margin: 0,
    textAlign: "center",
    textStyle: "title2",
  }),
};

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", sans-serif';

// The groups down the left edge, as the messaging apps' server rails: a
// mark each, the open one ringed and flagged at the edge, then the ways to
// start or join one.
const rail = {
  action: css({
    bg: "surface",
    border: 0,
    borderRadius: "50%",
    color: "accent",
    display: "grid",
    height: "42px",
    placeItems: "center",
    width: "42px",
  }),
  badge: css({
    bottom: 0,
    boxShadow: "0 0 0 2px var(--fill)",
    position: "absolute",
    right: "3px",
  }),
  divider: css({
    bg: "border",
    borderRadius: "1px",
    height: "2px",
    width: "28px",
  }),
  // The flag at the edge grows by the open group.
  item: css({
    "&::before": {
      _motionReduce: { transition: "none" },
      bg: "accent",
      borderRadius: "0 4px 4px 0",
      content: '""',
      height: 0,
      left: 0,
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      transition: "height 0.15s",
      width: "4px",
    },
    "&[aria-current=page]::before": { height: "30px" },
    bg: "transparent",
    border: 0,
    display: "grid",
    height: "46px",
    padding: 0,
    placeItems: "center",
    position: "relative",
    width: "58px",
  }),
  root: css({
    alignItems: "center",
    bg: "fill",
    borderRadius: "0 20px 20px 0",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "12px",
    padding: "12px 0",
    width: "58px",
  }),
};

// A group's mark in its frame: groups are rounded squares, people circles.
// On the rail the open one's ring sits on top of the mark, inside its
// edge, so a photo does not hide it and it keeps clear of the flag and
// badge. Larger for the join sheet and the mark's own pages, so a photo
// is cropped there as members see it.
const markFrame = cva({
  base: {
    "&::after": {
      borderRadius: "inherit",
      boxShadow: "inset 0 0 0 2px transparent, inset 0 0 0 4px transparent",
      content: '""',
      inset: 0,
      pointerEvents: "none",
      position: "absolute",
      transition: "box-shadow 0.15s",
    },
    "[aria-current=page] > &": {
      // A thin gap keeps the ring clear of a photo's own colors.
      "&::after": {
        boxShadow:
          "inset 0 0 0 2px var(--accent), inset 0 0 0 4px var(--surface)",
      },
      bg: "accentSoft",
      borderRadius: "12px",
    },
    _motionReduce: { transition: "none" },
    bg: "surface",
    borderRadius: "16px",
    display: "grid",
    fontFamily: EMOJI_FONT,
    fontSize: "22px",
    height: "42px",
    overflow: "hidden",
    placeItems: "center",
    position: "relative",
    transition: "border-radius 0.15s",
    width: "42px",
  },
  variants: {
    size: {
      large: {
        bg: "fill",
        borderRadius: "24px",
        height: "76px",
        width: "76px",
      },
    },
  },
});

// The same rounded square as the rail, small, before a row's name.
const smallMarkFrame = css({
  bg: "surface",
  borderRadius: "8px",
  display: "grid",
  height: "28px",
  overflow: "hidden",
  placeItems: "center",
  width: "28px",
});

// A group mark fills its frame, the same for every member: a photo, an
// emoji, a letter or an icon.
const markPart = {
  choiceEmoji: css({ fontFamily: EMOJI_FONT, fontSize: "20px" }),
  emoji: css({ fontFamily: EMOJI_FONT, lineHeight: 1 }),
  icon: css({
    display: "grid",
    height: "100%",
    placeItems: "center",
    width: "100%",
  }),
  iconBare: css({ display: "grid", placeItems: "center" }),
  letter: css({
    display: "grid",
    fontWeight: 700,
    height: "100%",
    lineHeight: 1,
    placeItems: "center",
    width: "100%",
  }),
  photo: css({
    display: "grid",
    height: "100%",
    objectFit: "cover",
    placeItems: "center",
    width: "100%",
  }),
};

// A person's round picture, yours in the accent.
const avatar = cva({
  base: {
    "& img": {
      borderRadius: "50%",
      height: "100%",
      objectFit: "cover",
      width: "100%",
    },
    bg: "var(--fill-3)",
    borderRadius: "50%",
    color: "text2",
    display: "grid",
    flexShrink: 0,
    fontSize: "11px",
    fontWeight: 600,
    height: "24px",
    placeItems: "center",
    width: "24px",
  },
  variants: { me: { true: { bg: "accentFill", color: "onAccentFill" } } },
});

// A day with no shift, as a small dot.
const emptyMark = css({
  bg: "var(--fill-3)",
  borderRadius: "50%",
  height: "6px",
  width: "6px",
});

// The group's page: its name, the week everyone works as a card with the
// next day all are off, then its chats and the rows of its settings.
const hub = {
  chatAll: css({
    bg: "accentSoft",
    borderRadius: "8px",
    color: "accent",
    display: "grid",
    flexShrink: 0,
    height: "28px",
    placeItems: "center",
    width: "28px",
  }),
  editMark: css({
    display: "grid",
    margin: "4px 0 20px",
    placeItems: "center",
  }),
  header: css({
    alignItems: "center",
    display: "flex",
    gap: "2px",
    paddingTop: "4px",
  }),
  icon: css({
    bg: "fill",
    borderRadius: "8px",
    display: "grid",
    flexShrink: 0,
    height: "26px",
    overflow: "hidden",
    placeItems: "center",
    width: "26px",
  }),
  // The rail at the phone's left edge, the page beside it.
  layout: css({
    display: "flex",
    flex: 1,
    gap: "8px",
    marginLeft: "-8px",
    minHeight: 0,
  }),
  // A long group name gives way to the controls instead of wrapping.
  name: css({
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  profileList: css({ marginTop: "20px" }),
  qr: css({
    alignItems: "center",
    bg: "surface",
    border: "1px solid token(colors.separator)",
    borderRadius: "20px",
    color: "text",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px 16px 20px",
  }),
  qrNote: css({ color: "text3", textStyle: "caption" }),
  rowIcon: css({ color: "accent", flexShrink: 0 }),
  sectionHead: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
  }),
  sectionHeadTitle: css({
    color: "text3",
    fontWeight: 600,
    margin: "0 0 0 12px",
    textStyle: "footnote",
  }),
  sectionLink: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "accent",
    display: "inline-flex",
    fontWeight: 600,
    gap: "1px",
    padding: "0 2px 0 8px",
    textStyle: "footnote",
  }),
  title: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    fontWeight: 700,
    gap: "8px",
    margin: 0,
    minWidth: 0,
    textStyle: "title2",
  }),
  // Only a frame on the screen's own color: the raised ground is white
  // like the screen's in light mode but lifted in dark, where the card
  // would float.
  weekCard: css({
    bg: "background",
    border: "1px solid token(colors.separator)",
    borderRadius: "16px",
    color: "text",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px 8px 12px 4px",
    textAlign: "left",
    width: "100%",
  }),
  // 次にみんな休み: a row under the week, laid out like 今月のみんな休み.
  weekCardNext: css({
    "& svg": { color: "textFaint" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderTop: "1px solid token(colors.separator)",
    color: "text2",
    display: "flex",
    gap: "8px",
    marginTop: "2px",
    padding: "12px 8px 2px 12px",
    textAlign: "left",
    textStyle: "footnote",
    width: "100%",
  }),
  weekCardNextValue: css({
    color: "accentStrong",
    fontWeight: 600,
    marginLeft: "auto",
  }),
  weekCardTable: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    padding: 0,
    textAlign: "left",
    width: "100%",
  }),
};

// 参加の確認, over the calendar when an invitation link is opened.
const join = {
  from: css({
    alignItems: "center",
    color: "text2",
    display: "flex",
    gap: "8px",
    margin: "12px 0 0",
    textStyle: "subheadline",
  }),
  members: css({
    "& small": { color: "text3", marginLeft: "4px", textStyle: "footnote" },
    alignItems: "center",
    display: "flex",
    gap: "8px",
    marginTop: "12px",
  }),
  name: css({ alignSelf: "stretch", marginTop: "20px", textAlign: "left" }),
  sheet: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
  }),
  text: css({
    color: "text3",
    lineHeight: 1.6,
    margin: "12px 0 16px",
    textStyle: "footnote",
  }),
  title: css({ fontWeight: 700, margin: "12px 0 0", textStyle: "title2" }),
};

// A profile's photo with a camera badge to change it, as the platforms'
// contact cards have it; the choices open in a sheet.
const photoPicker = {
  action: css({
    bg: "transparent",
    border: 0,
    color: "accent",
    cursor: "pointer",
    fontWeight: 600,
    padding: 0,
    textStyle: "body",
  }),
  badge: css({
    bg: "surface",
    borderRadius: "50%",
    bottom: "-2px",
    boxShadow: "0 1px 4px var(--shadow-strong)",
    color: "accent",
    display: "grid",
    height: "26px",
    placeItems: "center",
    position: "absolute",
    right: "-2px",
    width: "26px",
  }),
  cancel: css({
    bg: "fill",
    border: 0,
    borderRadius: "16px",
    color: "text",
    fontWeight: 600,
    marginTop: "12px",
    minHeight: "48px",
    textStyle: "callout",
    width: "100%",
  }),
  edit: css({
    bg: "transparent",
    border: 0,
    cursor: "pointer",
    padding: 0,
    position: "relative",
  }),
  root: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  }),
};

// Groups down the side, like chat apps with many rooms. The count is
// unread messages across the group's chats.
function GroupRail({
  groups,
  selected,
  unreadOf,
  onSelect,
  onNew,
  onScan,
}: {
  groups: Omit<Group, "members">[];
  selected: string;
  unreadOf: (id: string) => number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onScan: () => void;
}) {
  return (
    <nav aria-label="グループ" className={rail.root}>
      {groups.map((group) => {
        const unread = unreadOf(group.id);
        return (
          <button
            aria-current={group.id === selected ? "page" : undefined}
            aria-label={`${group.name}${unread > 0 ? `、未読${unread}件` : ""}`}
            className={rail.item}
            key={group.id}
            onClick={() => {
              onSelect(group.id);
            }}
            type="button"
          >
            <span aria-hidden="true" className={markFrame()}>
              <GroupIcon mark={group.mark} size={24} />
            </span>
            {unread > 0 && (
              <span aria-hidden="true" className={cx(badge, rail.badge)}>
                {unread}
              </span>
            )}
          </button>
        );
      })}
      <span aria-hidden="true" className={rail.divider} />
      <button
        aria-label="グループを作る"
        className={rail.action}
        onClick={onNew}
        type="button"
      >
        <Plus aria-hidden="true" size={20} />
      </button>
      <button
        aria-label="QRコードで参加"
        className={rail.action}
        onClick={onScan}
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
  const weekTools = useWeek();
  const week = weekTools.weekDates(designToday);
  const nextOff = Array.from({ length: 60 }, (_, index) =>
    addDays(designToday, index)
  ).find(
    (date) => group.members.length > 1 && everyoneOff(group.members, date)
  );
  const others = group.members.filter((member) => !member.me);
  // Members you already have a one-to-one chat with, in this group.
  const talking = others.filter(
    (member) => chatOf(member.id).messages.length > 0
  );
  const [picking, setPicking] = useState(false);
  return (
    <>
      <header className={hub.header}>
        <h3 className={hub.title}>
          <span aria-hidden="true" className={hub.icon}>
            <GroupIcon mark={group.mark} size={16} />
          </span>
          <span className={hub.name}>{group.name}</span>
        </h3>
        <IconButton label="メンバーを招待" onClick={onInvite}>
          <UserPlus aria-hidden="true" size={18} />
        </IconButton>
        <IconButton label="グループの設定" onClick={onSettings}>
          <Settings2 aria-hidden="true" size={18} />
        </IconButton>
      </header>
      <section>
        <div className={hub.sectionHead}>
          <h4 className={hub.sectionHeadTitle}>シフト</h4>
          <button className={hub.sectionLink} onClick={onShifts} type="button">
            月で見る
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
        <div className={hub.weekCard}>
          <button
            aria-label="今週のみんなのシフト。押すと月で見られます"
            className={hub.weekCardTable}
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
              className={hub.weekCardNext}
              onClick={() => {
                onShiftsDay(nextOff);
              }}
              type="button"
            >
              <span>次にみんな休み</span>
              <span className={hub.weekCardNextValue}>
                {formatDay(nextOff)}・{daysFromToday(nextOff)}
              </span>
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          ) : (
            <div className={hub.weekCardNext}>
              <span>次にみんな休み</span>
              <span className={hub.weekCardNextValue}>なし</span>
            </div>
          )}
        </div>
      </section>
      <Section title="チャット">
        <List>
          <ChatRow
            chat={chatOf(groupChat)}
            icon={
              <span className={hub.chatAll}>
                <MessagesSquare aria-hidden="true" size={15} />
              </span>
            }
            label="全体チャット"
            members={group.members}
            onOpen={() => {
              onChat(groupChat);
            }}
          />
          {talking.map((member) => (
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
          {others.length > talking.length && (
            <ListRow
              label="個人チャットを始める"
              leading={
                <>
                  <Plus aria-hidden="true" className={hub.rowIcon} size={18} />
                </>
              }
              onClick={() => {
                setPicking(true);
              }}
            />
          )}
        </List>
        {others.length === 0 && (
          <Note>メンバーを招待すると、1対1でも話せます。</Note>
        )}
        <Sheet
          label="個人チャットを始める"
          onOpenChange={setPicking}
          open={picking}
        >
          <SheetHeading
            onClose={() => {
              setPicking(false);
            }}
            title="個人チャットを始める"
          />
          <div className={sheetBody}>
            <section>
              <List>
                {others
                  .filter((member) => !talking.includes(member))
                  .map((member) => (
                    <ListRow
                      key={member.id}
                      label={member.name}
                      leading={
                        <>
                          <Avatar member={member} size={28} />
                        </>
                      }
                      onClick={() => {
                        setPicking(false);
                        onChat(member.id);
                      }}
                    />
                  ))}
              </List>
              <Note>{group.name}での名前とアイコンで話します。</Note>
            </section>
          </div>
        </Sheet>
      </Section>
    </>
  );
}

const memberButton = css({
  background: "transparent",
  border: 0,
  borderRadius: "50%",
  display: "grid",
  padding: 0,
});

const noMembers: Member[] = [];

// A member as this group knows them, and a way to talk one to one. The
// one-to-one chat belongs to the group, so both of you keep this group's
// names and pictures there.
function MemberSheet({
  member,
  group,
  onClose,
  onMessage,
  onRemove,
}: {
  member?: Member;
  group: Omit<Group, "members">;
  onClose: () => void;
  onMessage?: (member: Member) => void;
  // Takes them out of the group; any member may, as in LINE's groups.
  onRemove?: (member: Member) => void;
}) {
  const [viewing, setViewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <Sheet
      label={member?.name ?? ""}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={member !== undefined}
    >
      {member && (
        <>
          <SheetHeading onClose={onClose} title="" />
          <div className={profileStyle.root}>
            {member.photo ? (
              <button
                aria-label={`${member.name}の写真を大きく見る`}
                className={memberButton}
                onClick={() => {
                  setViewing(true);
                }}
                type="button"
              >
                <Avatar member={member} size={72} />
              </button>
            ) : (
              <Avatar member={member} size={72} />
            )}
            <h3 className={profileStyle.name}>{member.name}</h3>
            <span className={profileStyle.where}>
              <span aria-hidden="true" className={hub.icon}>
                <GroupIcon mark={group.mark} size={14} />
              </span>
              {group.name}でのプロフィール
            </span>
            {onMessage && (
              <Button
                className={profileStyle.message}
                onClick={() => {
                  onMessage(member);
                }}
              >
                <MessageCircle aria-hidden="true" size={18} />
                メッセージを送る
              </Button>
            )}
          </div>
          {onRemove && (
            <DestructiveButton
              onClick={() => {
                setConfirming(true);
              }}
            >
              このグループから外す
            </DestructiveButton>
          )}
        </>
      )}
      {member && onRemove && confirming && (
        <ConfirmDialog
          action="外す"
          message={`${member.name}は「${group.name}」のシフトとチャットを見られなくなります。外したことは全体チャットに表示されます。`}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            onRemove(member);
          }}
          title={`${member.name}を外しますか？`}
        />
      )}
      {member?.photo && (
        <PhotoViewer
          label={`${member.name}の写真`}
          onOpenChange={setViewing}
          open={viewing}
          photo={member.photo}
        />
      )}
    </Sheet>
  );
}

const profileStyle = {
  message: css({ alignSelf: "stretch", marginTop: "8px" }),
  name: css({ fontWeight: 700, margin: 0, textStyle: "title2" }),
  root: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "0 16px 16px",
  }),
  where: css({
    alignItems: "center",
    color: "text3",
    display: "flex",
    gap: "8px",
    textStyle: "footnote",
  }),
};

function lastLine(chat: Chat, members: Member[]) {
  const last = chat.messages.at(-1);
  if (!last) {
    return;
  }
  const who = members.find((member) => member.id === last.from);
  if (last.notice) {
    return last.notice;
  }
  const text = last.days ? `${summaryOf(last)}を共有しました` : last.text;
  return who?.me ? `自分：${text}` : text;
}

// How many are unread, on a chat's row and on the rail's group icon.
const badge = css({
  bg: "var(--badge)",
  borderRadius: "999px",
  color: "var(--on-badge)",
  display: "inline-grid",
  fontSize: "10px",
  fontWeight: 700,
  height: "18px",
  minWidth: "18px",
  padding: "0 4px",
  placeItems: "center",
});

// A chat in the hub's list: its name and last line, with the time and
// what is unread at the end.
const chatRow = {
  meta: css({
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "4px",
  }),
  name: css({ textStyle: "body" }),
  preview: css({
    color: "text4",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "caption",
    whiteSpace: "nowrap",
  }),
  text: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
  time: css({ color: "textFaint", textStyle: "caption2" }),
};

// A chat as the messaging apps draw one: others' bubbles on the left with
// their avatar and name at the start of a run, yours on the right in the
// accent; the day between runs, the time by the bubble, reactions under
// it, and the reply being written above the composer.
const chatStyle = {
  avatar: css({ flexShrink: 0, width: "32px" }),
  body: cva({
    base: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "84%",
      minWidth: 0,
    },
    variants: { mine: { true: { alignItems: "flex-end" } } },
  }),
  bubble: cva({
    base: {
      bg: "fill2",
      borderRadius: "16px 16px 16px 8px",
      color: "text",
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      overflow: "hidden",
    },
    variants: {
      mine: {
        true: {
          bg: "accentFill",
          borderRadius: "16px 16px 8px",
          color: "onAccentFill",
        },
      },
    },
  }),
  // A reply's quote inside the bubble, over a thin rule, in the bubble's
  // own text color.
  bubbleQuote: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    font: "inherit",
    gap: "2px",
    padding: "8px 12px 0",
    textAlign: "left",
  }),
  bubbleQuoteName: css({
    fontWeight: 600,
    opacity: 0.85,
    textStyle: "caption",
  }),
  bubbleQuoteText: css({
    lineClamp: 2,
    lineHeight: 1.45,
    opacity: 0.8,
    textStyle: "footnote",
  }),
  // The avatar sits at the top by the name, the time by the bubble, so
  // the reactions under it push neither down.
  bubbleRow: cva({
    base: { alignItems: "flex-end", display: "flex", gap: "8px" },
    variants: { mine: { true: { flexDirection: "row-reverse" } } },
  }),
  bubbleRule: css({
    bg: "currentcolor",
    height: "1px",
    margin: "8px -12px 0",
    opacity: 0.25,
  }),
  bubbleText: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "block",
    font: "inherit",
    lineHeight: 1.5,
    maxWidth: "100%",
    padding: "8px 12px",
    textAlign: "left",
    textStyle: "subheadline",
  }),
  composer: cva({
    base: {
      alignItems: "center",
      borderTop: "1px solid token(colors.separator)",
      display: "flex",
      gap: "8px",
      padding: "8px 0 4px",
    },
    // The reply above it already draws the line.
    variants: { replying: { true: { borderTop: 0 } } },
  }),
  composerButton: cva({
    base: {
      bg: "transparent",
      border: 0,
      borderRadius: "50%",
      color: "accent",
      display: "grid",
      flexShrink: 0,
      height: "38px",
      placeItems: "center",
      width: "38px",
    },
    variants: {
      send: {
        true: {
          _disabled: { bg: "controlOff" },
          bg: "accentFill",
          color: "onAccentFill",
        },
      },
    },
  }),
  composerInput: css({
    bg: "fill",
    border: 0,
    borderRadius: "999px",
    flex: 1,
    font: "inherit",
    height: "38px",
    minWidth: 0,
    padding: "0 16px",
    textStyle: "body",
  }),
  dayOpen: cva({
    base: {
      alignSelf: "flex-start",
      bg: "transparent",
      border: 0,
      color: "accent",
      padding: "0 4px",
      textDecoration: "underline",
      textStyle: "caption",
    },
    variants: { mine: { true: { alignSelf: "flex-end" } } },
  }),
  empty: css({ color: "text4", margin: "auto", textStyle: "footnote" }),
  header: css({
    alignItems: "center",
    borderBottom: "1px solid token(colors.separator)",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    padding: "4px 0 8px",
  }),
  // A message jumped to rings its bubble or shared days for a moment.
  item: cva({
    base: { display: "flex", flexDirection: "column", gap: "8px" },
    variants: {
      flash: {
        true: {
          "& :is([data-part=bubble], [data-part=day-card])": {
            _motionReduce: { animation: "none" },
            animation: "flash 1.2s ease-out",
          },
        },
      },
    },
  }),
  message: cva({
    base: { alignItems: "flex-start", display: "flex", gap: "8px" },
    variants: { mine: { true: { flexDirection: "row-reverse" } } },
  }),
  // Chat apps scroll without a bar over the bubbles.
  messages: css({
    "&::-webkit-scrollbar": { display: "none" },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "8px",
    listStyle: "none",
    margin: 0,
    minHeight: 0,
    overflowY: "auto",
    padding: "12px 2px",
    scrollbarWidth: "none",
  }),
  name: css({ color: "text3", paddingLeft: "4px", textStyle: "caption2" }),
  notice: css({
    alignSelf: "center",
    color: "text3",
    lineHeight: 1.5,
    margin: "8px auto",
    maxWidth: "85%",
    textAlign: "center",
    textStyle: "caption",
  }),
  // The message being answered, marked by the accent line at its start.
  quote: css({
    bg: "transparent",
    border: 0,
    borderColor: "accent",
    borderLeft: "3px solid token(colors.accent)",
    borderRadius: "2px",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "1px",
    marginBottom: "-2px",
    maxWidth: "100%",
    minWidth: 0,
    padding: "4px 12px",
    textAlign: "left",
  }),
  quoteName: css({ color: "text3", fontWeight: 600, textStyle: "caption2" }),
  quoteText: css({ color: "text4", lineClamp: 1, textStyle: "caption" }),
  reaction: css({
    "&[aria-pressed=true]": { bg: "accentSoft", borderColor: "accent" },
    alignItems: "center",
    bg: "surface",
    border: "1px solid token(colors.border)",
    borderRadius: "999px",
    display: "inline-flex",
    gap: "4px",
    height: "24px",
    padding: "0 8px",
    textStyle: "subheadline",
  }),
  reactionCount: css({ color: "text3", textStyle: "caption" }),
  reactions: cva({
    base: { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "-1px" },
    variants: { mine: { true: { justifyContent: "flex-end" } } },
  }),
  replying: css({
    alignItems: "center",
    borderTop: "1px solid token(colors.separator)",
    display: "flex",
    gap: "8px",
    padding: "8px 0 0",
  }),
  tap: cva({
    base: {
      bg: "transparent",
      border: 0,
      color: "inherit",
      display: "flex",
      font: "inherit",
      maxWidth: "100%",
      padding: 0,
      textAlign: "left",
    },
    variants: { mine: { true: { justifyContent: "flex-end" } } },
  }),
  time: css({
    color: "textFaint",
    flexShrink: 0,
    paddingBottom: "2px",
    textStyle: "caption2",
  }),
  title: css({ fontWeight: 600, margin: 0, textStyle: "headline" }),
  when: css({
    alignSelf: "center",
    bg: "fill2",
    borderRadius: "8px",
    color: "text3",
    margin: "8px 0 2px",
    padding: "2px 12px",
    textStyle: "caption2",
  }),
};

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
    <button
      className={cx(listRow.twoLine, listRow.pressable)}
      data-list-row=""
      onClick={onOpen}
      type="button"
    >
      {icon}
      <span className={chatRow.text}>
        <span className={chatRow.name}>{label}</span>
        <small className={chatRow.preview}>
          {preview ?? "まだメッセージはありません"}
        </small>
      </span>
      <span className={chatRow.meta}>
        {last && <small className={chatRow.time}>{last.time}</small>}
        {chat.unread > 0 && (
          <span className={badge} role="status">
            {chat.unread}
            <span className={srOnly}>件の未読</span>
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
  onMember,
  backLabel,
  formerMembers = noMembers,
}: {
  title: string;
  group: Group;
  // Where 戻る goes: the group, or the chat a member was opened from.
  backLabel: string;
  // Members taken out of the group, so their past lines keep a face.
  formerMembers?: Member[];
  // Opens a member's profile from their picture.
  onMember?: (member: Member) => void;
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
  // The line whose reaction is being picked from every emoji.
  const [pickingFor, setPickingFor] = useState<string>();
  const [flash, setFlash] = useState<string>();
  const isGroup = title === "全体チャット";
  // Who wrote a line, including members taken out since, whose lines stay.
  const writerOf = (id?: string) =>
    [...group.members, ...formerMembers].find((member) => member.id === id);
  const byId = (id?: string) =>
    chat.messages.find((message) => message.id === id);
  const nameOf = (id: string) => writerOf(id)?.name ?? "";
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
  // The props that turn a message into the opener of its actions.
  const actionsOf = (message: Message) => ({
    mine: message.from === "me",
    onMore: () => {
      setSelected(undefined);
      setPickingFor(message.id);
    },
    onOpenChange: (open: boolean) => {
      setSelected(open ? message.id : undefined);
    },
    onReact: (emoji: string) => {
      react(message.id, emoji);
    },
    onReply: () => {
      setReplyTo(message.id);
      setSelected(undefined);
    },
    open: selected === message.id,
    text: message.text,
  });
  const replying = byId(replyTo);
  return (
    <Screen>
      <header className={chatStyle.header}>
        <BackButton onClick={onBack}>{backLabel}</BackButton>
        <h3 className={chatStyle.title}>{title}</h3>
      </header>
      <ol aria-label={`${title}のメッセージ`} className={chatStyle.messages}>
        {chat.messages.length === 0 && (
          <li className={chatStyle.empty}>まだメッセージはありません</li>
        )}
        {chat.messages.map((message, index) => {
          const previous = chat.messages[index - 1];
          const member = writerOf(message.from);
          const current =
            member !== undefined && group.members.includes(member);
          const mine = member?.me === true;
          const firstOfRun =
            previous?.from !== message.from ||
            previous.notice !== undefined ||
            message.replyTo !== undefined;
          const quoted = byId(message.replyTo);
          if (message.notice) {
            return (
              <li className={chatStyle.item()} key={message.id}>
                {previous?.when !== message.when && (
                  <span className={chatStyle.when}>{message.when}</span>
                )}
                <p className={chatStyle.notice}>{message.notice}</p>
              </li>
            );
          }
          return (
            <li
              className={chatStyle.item({ flash: flash === message.id })}
              id={`message-${message.id}`}
              key={message.id}
            >
              {previous?.when !== message.when && (
                <span className={chatStyle.when}>{message.when}</span>
              )}
              <span className={chatStyle.message({ mine })}>
                {!mine && (
                  <span className={chatStyle.avatar}>
                    {firstOfRun &&
                      member &&
                      (onMember && current ? (
                        <button
                          aria-label={`${member.name}のプロフィール`}
                          className={memberButton}
                          onClick={() => {
                            onMember(member);
                          }}
                          type="button"
                        >
                          <Avatar member={member} size={chatAvatarSize} />
                        </button>
                      ) : (
                        <Avatar member={member} size={chatAvatarSize} />
                      ))}
                  </span>
                )}
                <span className={chatStyle.body({ mine })}>
                  {!mine && isGroup && firstOfRun && (
                    <small className={chatStyle.name}>{member?.name}</small>
                  )}
                  <span
                    className={cx(
                      chatStyle.bubbleRow({ mine }),
                      selected === message.id && messageActions.lifted
                    )}
                  >
                    {message.days ? (
                      <MessageActions {...actionsOf(message)}>
                        <button
                          aria-label={`${member?.name ?? ""}が共有した日にち。押すとリアクションと返信`}
                          className={chatStyle.tap({ mine })}
                          type="button"
                        >
                          <DayCard days={message.days} members={people} />
                        </button>
                      </MessageActions>
                    ) : (
                      // Like the app: the quoted line sits inside the bubble,
                      // above a thin rule, and jumps to the original.
                      <span
                        className={chatStyle.bubble({ mine })}
                        data-part="bubble"
                      >
                        {quoted && (
                          <button
                            aria-label={`${nameOf(quoted.from)}への返信。返信元を表示`}
                            className={chatStyle.bubbleQuote}
                            onClick={() => {
                              jumpTo(quoted.id);
                            }}
                            type="button"
                          >
                            <span className={chatStyle.bubbleQuoteName}>
                              {nameOf(quoted.from)}
                            </span>
                            <span className={chatStyle.bubbleQuoteText}>
                              {summaryOf(quoted)}
                            </span>
                            <span
                              aria-hidden="true"
                              className={chatStyle.bubbleRule}
                            />
                          </button>
                        )}
                        <MessageActions {...actionsOf(message)}>
                          <button
                            aria-label={`${member?.name ?? ""}のメッセージ：${message.text ?? ""}。押すとリアクションと返信`}
                            className={chatStyle.bubbleText}
                            type="button"
                          >
                            {message.text}
                          </button>
                        </MessageActions>
                      </span>
                    )}
                    <small className={chatStyle.time}>{message.time}</small>
                  </span>
                  {message.days && (
                    <button
                      className={chatStyle.dayOpen({ mine })}
                      onClick={() => message.days && onOpenDay(message.days[0])}
                      type="button"
                    >
                      シフト表で見る
                    </button>
                  )}
                  {message.reactions && message.reactions.length > 0 && (
                    <span className={chatStyle.reactions({ mine })}>
                      {message.reactions.map((reaction) => (
                        <button
                          aria-label={`${reaction.emoji} ${reaction.by.map(nameOf).join("、")}`}
                          aria-pressed={reaction.by.includes("me")}
                          className={chatStyle.reaction}
                          key={reaction.emoji}
                          onClick={() => {
                            react(message.id, reaction.emoji);
                          }}
                          type="button"
                        >
                          {reaction.emoji}
                          <small className={chatStyle.reactionCount}>
                            {reaction.by.length}
                          </small>
                        </button>
                      ))}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {replying && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>
              {nameOf(replying.from)}に返信
            </span>
            <span className={chatStyle.quoteText}>{summaryOf(replying)}</span>
          </span>
          <IconButton
            glass={false}
            label="返信をやめる"
            onClick={() => {
              setReplyTo(undefined);
            }}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      <form
        className={chatStyle.composer({ replying: replying !== undefined })}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <button
          aria-label="日にちを共有"
          className={chatStyle.composerButton()}
          onClick={() => {
            setSharing(true);
          }}
          type="button"
        >
          <CalendarPlus aria-hidden="true" size={20} />
        </button>
        <input
          aria-label="メッセージ"
          className={chatStyle.composerInput}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="メッセージ"
          value={draft}
        />
        <button
          aria-label="送る"
          className={chatStyle.composerButton({ send: true })}
          disabled={draft.trim() === ""}
          type="submit"
        >
          <SendHorizontal aria-hidden="true" size={18} />
        </button>
      </form>
      <EmojiPickerSheet
        onOpenChange={(open) => {
          if (!open) {
            setPickingFor(undefined);
          }
        }}
        onPick={(emoji) => {
          if (pickingFor) {
            react(pickingFor, emoji);
          }
        }}
        open={pickingFor !== undefined}
        title="リアクション"
      />
      <DaySheet
        members={people}
        onOpenChange={setSharing}
        onShare={(days) => {
          post({ days });
          setSharing(false);
        }}
        open={sharing}
      />
    </Screen>
  );
}

const flashMilliseconds = 1200;

const messageActions = {
  // The message the actions are for stays bright above the dimming.
  lifted: css({ position: "relative", zIndex: 25 }),
  scrim: css({
    animation: "fadeIn 0.2s ease-out",
    bg: "var(--scrim)",
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
  more: css({ color: "text2" }),
  reaction: css({
    _focusVisible: { outline: "2px solid token(colors.accent)" },
    _hover: { bg: "fill2" },
    bg: "transparent",
    border: 0,
    borderRadius: "50%",
    display: "grid",
    height: "34px",
    padding: 0,
    placeItems: "center",
    textStyle: "title2",
    width: "34px",
  }),
  reactions: css({
    alignItems: "center",
    bg: "raised",
    border: "1px solid token(colors.border)",
    borderRadius: "999px",
    boxShadow: "0 4px 14px var(--shadow)",
    display: "flex",
    gap: "2px",
    padding: "4px",
  }),
  // Your own messages sit on the right, and so do their actions.
  end: css({ alignItems: "flex-end" }),
  start: css({ alignItems: "flex-start" }),
};

// Reactions, and a little apart the menu of 返信 and コピー, as the
// platforms' context menus on a message in LINE and iMessage: the rest of
// the screen dims while the message stays bright. Ark UI's
// Popover opens it from the message, moves focus in, and closes it by a
// tap elsewhere or Escape.
function MessageActions({
  open,
  onOpenChange,
  mine,
  text,
  onReact,
  onMore,
  onReply,
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
  // The message itself, a button that opens this.
  children: ReactElement;
}) {
  const phone = useContext(PhoneContext);
  const toast = useContext(ToastContext);
  // Focus lands on the whole, as in a sheet, not on 👍 with a ring.
  const contentRef = useRef<HTMLDivElement>(null);
  const copy = async () => {
    onOpenChange(false);
    try {
      await navigator.clipboard.writeText(text ?? "");
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  };
  return (
    <Popover.Root
      initialFocusEl={() => contentRef.current}
      lazyMount
      onOpenChange={(details) => {
        onOpenChange(details.open);
      }}
      open={open}
      positioning={{
        gutter: 8,
        placement: mine ? "bottom-end" : "bottom-start",
      }}
      unmountOnExit
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
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
                    copy().catch(() => undefined);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Copy aria-hidden="true" size={18} />
                  </span>
                  コピー
                </button>
              )}
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

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

// A date colored as the week's settings say: Sundays and holidays red,
// Saturdays blue.
const toneColor: Record<DayTone, string | undefined> = {
  holiday: css({ color: "holiday" }),
  plain: undefined,
  saturday: css({ color: "saturday" }),
};

// The month in the corner where the dates and names meet.
const cornerMonth = css({ color: "text3", fontSize: "11px", fontWeight: 600 });

const smallWeekday = css({
  fontSize: "9px",
  fontWeight: 400,
  marginLeft: "2px",
});

// A day off is a light tile behind its mark, with a little room around
// it, in the same color whatever the person's pattern; a day everyone is
// off joins the tiles into one band, down a date's column in 週ごと, along
// a day's row in 日ごと. The picked day is framed the same way, as one
// piece, its ends reaching into the week's padding to clear the date and
// marks.
const offTile = {
  bg: "accentSoft",
  borderRadius: "8px",
  content: '""',
  inset: "3px",
  position: "absolute",
  zIndex: -1,
} as const;
const pickedFrame = {
  border: "0 solid token(colors.accent)",
  content: '""',
  pointerEvents: "none",
  position: "absolute",
  zIndex: 1,
} as const;

// 週ごと: a block per week, dates across and a row per person, the
// weekdays pinned above while the page scrolls. Compact, it is the single
// week inside the hub's card, without its own frame.
const weekTable = {
  dates: css({ fontSize: "11px", fontWeight: 600, textAlign: "center" }),
  name: css({ display: "grid", placeItems: "center" }),
  nameButton: css({ bg: "transparent", border: 0, padding: 0 }),
  root: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  row: cva({
    base: {
      alignItems: "center",
      display: "grid",
      gridTemplateColumns: "34px repeat(7, minmax(0, 1fr))",
    },
    variants: {
      compact: {
        true: { gridTemplateColumns: "28px repeat(7, minmax(0, 1fr))" },
      },
    },
  }),
  // Room above the dates and below the last person, so the picked day's
  // frame and the shared days off stay clear of the edge. Inside the
  // hub's card it takes the card's ground: the screen's would cut a hole
  // in it in dark mode.
  week: cva({
    base: {
      bg: "background",
      border: "1px solid token(colors.separator)",
      borderRadius: "16px",
      overflow: "hidden",
      padding: "4px 0",
    },
    variants: {
      compact: {
        true: { bg: "transparent", border: 0, borderRadius: 0, padding: 0 },
      },
    },
  }),
  // A list of months: its rows placed where they fall, only those in
  // sight drawn.
  item: css({ left: 0, position: "absolute", top: 0, width: "100%" }),
  list: css({ position: "relative" }),
  // A month's heading between the weeks of a list of months.
  divider: css({
    borderBottom: "1px solid token(colors.separator)",
    padding: "8px 0 8px 4px",
  }),
  weekdays: cva({
    base: { color: "text4", fontSize: "10px", textAlign: "center" },
    variants: {
      pinned: {
        true: {
          bg: "background",
          margin: "-8px 0 -8px",
          padding: "8px 0 4px",
          position: "sticky",
          top: "var(--pinned-top, -8px)",
          zIndex: 5,
        },
      },
    },
  }),
};

// A date or a person's day in 週ごと.
const weekCell = cva({
  base: { isolation: "isolate", position: "relative" },
  compoundVariants: [
    { button: true, css: { padding: 0 }, kind: "date" },
    {
      css: {
        "&::before": {
          ...offTile,
          borderRadius: "12px 12px 0 0",
          inset: "2px 2px 0",
        },
      },
      kind: "date",
      together: true,
    },
    {
      css: { "&::before": { borderRadius: 0, inset: "0 2px" } },
      kind: "cell",
      together: true,
    },
    {
      css: {
        "&::before": { borderRadius: "0 0 12px 12px", inset: "0 2px 3px" },
      },
      kind: "cell",
      last: true,
      together: true,
    },
    // Tiles sit tighter in the small weekly table.
    {
      compact: true,
      css: { "&::before": { borderRadius: "8px", inset: "2px 3px" } },
      off: true,
      together: false,
    },
    { compact: true, css: { height: "26px" }, kind: "cell" },
    {
      css: {
        "&::after": {
          borderRadius: "12px 12px 0 0",
          borderWidth: "1.5px 1.5px 0",
          inset: "-3px 1px 0",
        },
      },
      kind: "date",
      picked: true,
    },
    {
      css: { "&::after": { borderWidth: "0 1.5px", inset: "0 1px" } },
      kind: "cell",
      picked: true,
    },
    {
      css: {
        "&::after": {
          borderRadius: "0 0 12px 12px",
          borderWidth: "0 1.5px 1.5px",
          inset: "0 1px -3px",
        },
      },
      kind: "cell",
      last: true,
      picked: true,
    },
  ],
  defaultVariants: { compact: false, last: false, off: false, together: false },
  variants: {
    button: {
      true: {
        bg: "transparent",
        border: 0,
        font: "inherit",
        padding: 0,
        width: "100%",
      },
    },
    compact: { false: {}, true: {} },
    kind: {
      cell: { display: "grid", height: "30px", placeItems: "center" },
      date: { padding: "8px 0 4px" },
    },
    last: { false: {}, true: {} },
    off: { false: {}, true: { "&::before": offTile } },
    outside: { true: { opacity: 0.35 } },
    picked: { true: { "&::after": pickedFrame } },
    together: { false: {}, true: {} },
    tone: {
      holiday: { color: "holiday" },
      plain: {},
      saturday: { color: "saturday" },
    },
  },
});

// 日ごと: a row per day and a column per person, like a printed roster.
// Up to seven people the page scrolls and the frame shows whole, one
// scroll only; more scroll sideways inside it, the dates and your own
// column pinned, over the cells' tiles, with an edge only then.
const dayRows = {
  cell: cva({
    base: {
      borderBottom: "1px solid var(--separator-faint)",
      isolation: "isolate",
      padding: "0 4px",
      position: "relative",
      textAlign: "center",
    },
    compoundVariants: [
      {
        css: { "&::before": { borderRadius: 0, inset: "3px 0" } },
        off: true,
        together: true,
      },
      {
        css: {
          "&::before": {
            borderRadius: "0 12px 12px 0",
            inset: "3px 3px 3px 0",
          },
        },
        end: true,
        off: true,
        together: true,
      },
      {
        css: { "&::after": { borderWidth: "1.5px 0", inset: "1px 0" } },
        end: false,
        picked: true,
      },
      {
        css: {
          "&::after": {
            borderRadius: "0 12px 12px 0",
            borderWidth: "1.5px 1.5px 1.5px 0",
            inset: "1px 1px 1px 0",
          },
        },
        end: true,
        picked: true,
      },
      {
        css: { boxShadow: "1px 0 0 token(colors.separator)" },
        me: true,
        scrolls: true,
      },
    ],
    defaultVariants: { end: false },
    variants: {
      end: { false: {}, true: {} },
      last: { true: { borderBottom: 0 } },
      me: {
        true: { bg: "background", left: "46px", position: "sticky", zIndex: 2 },
      },
      off: { true: { "&::before": offTile } },
      picked: { true: { "&::after": pickedFrame } },
      scrolls: { true: {} },
      together: { true: {} },
    },
  }),
  cellButton: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "flex",
    font: "inherit",
    justifyContent: "center",
    minHeight: "36px",
    padding: 0,
    width: "100%",
  }),
  date: cva({
    base: {
      bg: "background",
      borderBottom: "1px solid var(--separator-faint)",
      borderLeft: "3px solid transparent",
      fontWeight: 600,
      height: "36px",
      isolation: "isolate",
      left: 0,
      padding: "0 0 0 12px",
      position: "sticky",
      textAlign: "left",
      zIndex: 2,
    },
    variants: {
      last: { true: { borderBottom: 0 } },
      picked: {
        true: {
          "&::after": {
            ...pickedFrame,
            borderRadius: "12px 0 0 12px",
            borderWidth: "1.5px 0 1.5px 1.5px",
            inset: "1px 0 1px 1px",
          },
        },
      },
      today: { true: { borderLeftColor: "accent" } },
      together: {
        true: {
          "&::before": {
            ...offTile,
            borderRadius: "12px 0 0 12px",
            inset: "3px 0 3px 3px",
          },
        },
      },
    },
  }),
  dateButton: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "block",
    font: "inherit",
    padding: 0,
    textAlign: "left",
    width: "100%",
  }),
  // A month's heading between the months: kept at the left edge when the
  // table scrolls sideways.
  divider: css({
    "& > *": { left: 0, position: "sticky" },
    borderBottom: "1px solid token(colors.separator)",
    padding: "20px 0 8px 12px",
  }),
  empty: css({ color: "textDisabled", fontSize: "10px" }),
  // Stands for the rows of a list of months not drawn yet.
  spacer: css({ border: 0, padding: 0 }),
  // The header stays on top as the rows scroll; a border would scroll away
  // with collapsed borders, so a shadow draws its line.
  head: cva({
    base: {
      bg: "background",
      boxShadow: "0 1px 0 token(colors.separator)",
      fontWeight: 600,
      padding: "8px 4px",
      position: "sticky",
      top: 0,
      zIndex: 3,
    },
    compoundVariants: [
      { corner: true, css: { borderTopLeftRadius: "12px" }, page: true },
      { css: { borderTopRightRadius: "12px" }, last: true, page: true },
      {
        css: {
          boxShadow:
            "0 1px 0 token(colors.separator), 1px 0 0 token(colors.separator)",
        },
        me: true,
        scrolls: true,
      },
    ],
    variants: {
      corner: { true: { left: 0, width: "46px", zIndex: 4 } },
      last: { true: {} },
      me: { true: { left: "46px", zIndex: 4 } },
      // Under the page's own pinned rows, when it has any.
      page: { true: { top: "var(--pinned-top, -8px)" } },
      scrolls: { true: {} },
    },
  }),
  mark: css({
    alignItems: "center",
    display: "flex",
    gap: "4px",
    justifyContent: "center",
    minWidth: 0,
  }),
  // A face with its name, or the face alone, centered, once names do not
  // fit.
  member: cva({
    base: {
      alignItems: "center",
      bg: "transparent",
      border: 0,
      color: "inherit",
      display: "inline-flex",
      font: "inherit",
      gap: "4px",
      maxWidth: "100%",
      overflow: "hidden",
      padding: 0,
      whiteSpace: "nowrap",
    },
    variants: {
      centered: { true: { justifyContent: "center", width: "100%" } },
    },
  }),
  name: css({
    color: "text",
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  scroll: cva({
    base: {
      bg: "background",
      border: "1px solid token(colors.separator)",
      borderRadius: "16px",
      maxHeight: "520px",
      overflow: "auto",
    },
    variants: { page: { true: { maxHeight: "none", overflow: "visible" } } },
  }),
  table: css({
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: "12px",
    tableLayout: "fixed",
    width: "100%",
  }),
  weekday: css({ fontSize: "9px", fontWeight: 400, marginLeft: "4px" }),
};

// Shared days in a message: one day spreads its people out; several make
// a small table, a row per day.
const dayCard = {
  card: cva({
    base: {
      bg: "surface",
      border: "1px solid token(colors.border)",
      borderRadius: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "12px 12px",
    },
    variants: { many: { true: { gap: 0, padding: "8px 8px" } } },
  }),
  cell: cva({
    base: {
      borderRadius: "8px",
      display: "grid",
      height: "24px",
      placeItems: "center",
      width: "100%",
    },
    variants: { off: { true: { "&::before": offTile, bg: "accentSoft" } } },
  }),
  date: css({
    bg: "transparent",
    border: 0,
    fontSize: "11px",
    fontWeight: 600,
    justifySelf: "start",
    padding: "0 0 0 4px",
  }),
  head: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "text",
    display: "flex",
    fontSize: "12px",
    fontWeight: 600,
    gap: "8px",
    padding: 0,
    textAlign: "left",
  }),
  people: css({ display: "flex", gap: "12px" }),
  person: css({
    alignItems: "center",
    color: "text3",
    display: "flex",
    flexDirection: "column",
    fontSize: "9px",
    gap: "4px",
  }),
  row: cva({
    base: {
      alignItems: "center",
      borderRadius: "8px",
      display: "grid",
      gap: "4px",
      justifyItems: "center",
      minHeight: "28px",
    },
    variants: {
      names: { true: { minHeight: "30px" } },
      together: { true: { bg: "accentSoft" } },
    },
  }),
};

// Picking days to share: everyone's days off to take at once, then the
// month to tap days in.
const shareDays = {
  day: cva({
    base: {
      "&[aria-pressed=true]": { bg: "accentFill", color: "onAccentFill" },
      _disabled: { visibility: "hidden" },
      bg: "transparent",
      border: 0,
      borderRadius: "12px",
      fontSize: "13px",
      fontWeight: 600,
      height: "36px",
      padding: 0,
    },
    variants: {
      together: { true: { bg: "accentSoft" } },
      tone: {
        holiday: { color: "holiday" },
        plain: {},
        saturday: { color: "saturday" },
      },
    },
  }),
  days: css({
    display: "grid",
    gap: "4px",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  }),
  suggest: css({
    alignItems: "center",
    bg: "accentSoft",
    borderRadius: "16px",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    padding: "12px 12px",
  }),
  suggestion: css({
    "&[aria-pressed=true]": { bg: "accentFill", color: "onAccentFill" },
    bg: "surface",
    border: "1.5px solid transparent",
    borderRadius: "999px",
    color: "accent",
    fontWeight: 600,
    minHeight: "30px",
    padding: "0 12px",
    textStyle: "footnote",
  }),
  togetherLabel: css({
    color: "accent",
    fontWeight: 600,
    marginRight: "4px",
    textStyle: "footnote",
  }),
  weekday: css({ color: "text4", fontSize: "10px", textAlign: "center" }),
};

// ‹ 2026年9月 › over a month, and ‹ 8月 · 10月 › under its table.
const monthSwitch = {
  bar: cva({
    base: {
      "& button": {
        bg: "transparent",
        border: 0,
        borderRadius: "12px",
        color: "accent",
        display: "grid",
        height: "32px",
        placeItems: "center",
        width: "32px",
      },
      "& strong": { minWidth: "96px", textAlign: "center", textStyle: "body" },
      alignItems: "center",
      display: "flex",
      gap: "8px",
      justifyContent: "center",
      marginTop: "-8px",
    },
    // In the shifts page's row, beside 今月.
    // A longhand, so it outranks the base's marginTop.
    variants: { inRow: { true: { marginTop: 0 } } },
  }),
  foot: css({
    display: "flex",
    justifyContent: "space-between",
    marginTop: "-4px",
  }),
  footButton: css({
    alignItems: "center",
    bg: "transparent",
    border: "1px solid token(colors.border)",
    borderRadius: "999px",
    color: "accent",
    display: "inline-flex",
    fontWeight: 600,
    gap: "2px",
    minHeight: "34px",
    padding: "0 12px",
    textStyle: "subheadline",
  }),
};

// The group's shifts page: the month in the middle, 今月 at the right
// edge, the table under it, and room at the foot for the picked day's
// sheet to cover.
const shiftsPage = {
  legendMember: css({ alignItems: "center", display: "flex", gap: "8px" }),
  monthName: css({ fontWeight: 600, textStyle: "headline" }),
  // The month's name and 今日 or 今月.
  monthRow: css({
    alignItems: "center",
    display: "flex",
    height: "48px",
    justifyContent: "space-between",
  }),
  month: css({
    alignItems: "center",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
  }),
  root: cva({
    base: { display: "flex", flexDirection: "column", gap: "16px" },
    // Room to scroll the last weeks out from under the sheet.
    variants: { withSheet: { true: { paddingBottom: "300px" } } },
  }),
  // Over a list of months, the page's header and the month row stay on
  // top, spanning the screen so the rows pass under them.
  bar: css({
    bg: "background",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    margin: "-8px -20px 0",
    padding: "8px 20px 0",
    position: "sticky",
    top: "-8px",
    zIndex: 6,
  }),
  scrolling: css({ display: "flex", flexDirection: "column", gap: "16px" }),
  sheetTime: css({ color: "text4", textStyle: "caption" }),
  // A mark and its name, as markValue sets them apart in a row's value.
  sheetValue: css({ alignItems: "center", display: "inline-flex", gap: "8px" }),
  togetherNone: css({ color: "text3", fontWeight: 600, textStyle: "headline" }),
};

// 人ごと: who to show, a row of chips that scrolls sideways out to the
// screen's edges, so a half-shown name says there are more.
const people = {
  choice: css({
    _checked: {
      bg: "surface",
      borderColor: "accent",
      color: "text",
      fontWeight: 600,
    },
    alignItems: "center",
    bg: "fill",
    border: "1px solid transparent",
    borderRadius: "999px",
    color: "text2",
    display: "inline-flex",
    flexShrink: 0,
    gap: "8px",
    minHeight: "36px",
    padding: "0 12px 0 8px",
    textStyle: "subheadline",
  }),
  list: css({
    border: 0,
    display: "flex",
    gap: "8px",
    margin: "-8px -20px 0",
    minWidth: 0,
    overflowX: "auto",
    padding: "0 20px",
    position: "relative",
    scrollPaddingInline: "19px",
  }),
};

// Shared dates with each person's shift. One day spreads out; several
// become a small table, a row per day.
function DayCard({ days, members }: { days: Date[]; members: Member[] }) {
  const weekTools = useWeek();
  const [first] = days;
  if (days.length === 1 && first) {
    const together = everyoneOff(members, first);
    return (
      <span className={dayCard.card()} data-part="day-card">
        <span className={dayCard.head}>
          {formatDay(first)}
          {together && (
            <Tag size="sm" tone="accent">
              みんな休み
            </Tag>
          )}
        </span>
        <span className={dayCard.people}>
          {members.map((member) => (
            <span className={dayCard.person} key={member.id}>
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
    <span className={dayCard.card({ many: true })} data-part="day-card">
      <span className={dayCard.row({ names: true })} style={columns}>
        <span />
        {members.map((member) => (
          <span key={member.id}>
            <Avatar member={member} />
            <span className={srOnly}>{member.name}</span>
          </span>
        ))}
      </span>
      {days.map((date) => (
        <span
          className={dayCard.row({ together: everyoneOff(members, date) })}
          key={dateKey(date)}
          style={columns}
        >
          <span
            className={cx(dayCard.date, toneColor[weekTools.dateTone(date)])}
          >
            {date.getMonth() + 1}/{date.getDate()}
            <small className={smallWeekday}>
              {weekdayLabels[date.getDay()]}
            </small>
          </span>
          {members.map((member) => (
            <span
              className={dayCard.cell({
                off: patternOn(member, date)?.off === true,
              })}
              key={member.id}
            >
              <Mark date={date} member={member} size={15} />
              <span className={srOnly}>
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
  open,
  onOpenChange,
  members,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  onShare: (days: Date[]) => void;
}) {
  return (
    <Sheet label="日にちを共有" onOpenChange={onOpenChange} open={open}>
      <DaySheetBody
        members={members}
        onClose={() => {
          onOpenChange(false);
        }}
        onShare={onShare}
      />
    </Sheet>
  );
}

const daySheetStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
});

// Inside the sheet, so what was picked starts over each time it opens.
function DaySheetBody({
  members,
  onClose,
  onShare,
}: {
  members: Member[];
  onClose: () => void;
  onShare: (days: Date[]) => void;
}) {
  const weekTools = useWeek();
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
    <div className={daySheetStack}>
      <DecideHeading
        action="送る"
        disabled={picked.length === 0}
        onAction={() => {
          onShare(picked);
        }}
        onCancel={onClose}
        title="日にちを共有"
      />
      {suggestions.length > 0 && (
        <div className={shareDays.suggest}>
          <span className={shareDays.togetherLabel}>みんな休み</span>
          {suggestions.map((date) => (
            <button
              aria-pressed={isPicked(date)}
              className={shareDays.suggestion}
              key={dateKey(date)}
              onClick={() => {
                toggle(date);
              }}
              type="button"
            >
              {date.getMonth() + 1}/{date.getDate()}
              <small className={smallWeekday}>
                {weekdayLabels[date.getDay()]}
              </small>
            </button>
          ))}
        </div>
      )}
      <div className={monthSwitch.bar()}>
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
      <div className={shareDays.days}>
        {weekTools.weekdays.map((day) => (
          <span aria-hidden="true" className={shareDays.weekday} key={day.day}>
            {day.label}
          </span>
        ))}
        {weekTools.monthDates(month).map((date) => {
          const outside = !sameMonth(date, month);
          const together = !outside && everyoneOff(members, date);
          return (
            <button
              aria-label={`${formatDay(date)}${together ? "、みんな休み" : ""}`}
              aria-pressed={isPicked(date)}
              className={shareDays.day({
                together,
                tone: weekTools.dateTone(date),
              })}
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
      <Note>
        {picked.length > 0
          ? `${picked.length}日分のみんなのシフトを送ります。`
          : "日付に枠がある日は、みんな休みの日です。"}
      </Note>
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

const layoutOptions: { value: Layout; label: string }[] = [
  { label: "週ごと", value: "weeks" },
  { label: "日ごと", value: "days" },
  { label: "人ごと", value: "person" },
];

function defaultLayout(count: number): Layout {
  return count <= marksUpTo ? "days" : "weeks";
}

function ShiftsPage({
  group,
  backLabel,
  day,
  month: initialMonth,
  monthNav,
  layout,
  onLayout: setLayout,
  onBack,
}: {
  group: Group;
  backLabel: string;
  // A day to open picked, from 次にみんな休み.
  day?: Date;
  month?: Date;
  monthNav: MonthNav;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onBack: () => void;
}) {
  const weekTools = useWeek();
  const [month, setMonth] = useState(initialMonth ?? designMonth);
  // Whose marks the legend sheet shows; kept while it closes.
  const [legend, setLegend] = useState<Member[]>(group.members);
  const [legendOpen, setLegendOpen] = useState(false);
  const [picked, setPicked] = useState<Date | undefined>(day);
  const toast = useContext(ToastContext);
  const dates = weekTools.monthDates(month);
  const pick = (date: Date) => {
    setPicked(picked && dateKey(picked) === dateKey(date) ? undefined : date);
  };
  // A list of months pins the page's header over it, with the month row.
  const scrolling = monthNav === "title" && layout !== "person";
  const header = (
    <PageHeader
      inlineTitle={group.name}
      leading={<BackButton onClick={onBack}>{backLabel}</BackButton>}
      trailing={
        <ShiftsMenu
          layout={layout}
          onLayout={setLayout}
          onLegend={() => {
            setLegend(group.members);
            setLegendOpen(true);
          }}
          onSave={() => {
            toast(`${month.getMonth() + 1}月のシフト表を写真に保存しました`);
          }}
        />
      }
    />
  );
  return (
    <div className={shiftsPage.root({ withSheet: picked !== undefined })}>
      {!scrolling && header}
      <PagedShifts
        dates={dates}
        group={group}
        header={header}
        layout={layout}
        month={month}
        monthNav={monthNav}
        onMember={(member) => {
          setLegend([member]);
          setLegendOpen(true);
        }}
        onMonth={setMonth}
        onPickDay={pick}
        picked={picked}
      />
      <PickedDaySheet
        date={picked}
        members={group.members}
        onClose={() => {
          setPicked(undefined);
        }}
      />
      <LegendSheet
        members={legend}
        onOpenChange={setLegendOpen}
        open={legendOpen}
      />
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
  const current = layoutOptions.find((option) => option.value === layout);
  return (
    <PullDownMenu label={current?.label}>
      <MenuPicker
        onValueChange={onLayout}
        options={layoutOptions}
        value={layout}
      />
      <MenuSeparator />
      <MenuItem
        icon={<Info aria-hidden="true" size={18} />}
        onSelect={onLegend}
        value="legend"
      >
        シフトパターン
      </MenuItem>
      <MenuItem
        icon={<Download aria-hidden="true" size={18} />}
        onSelect={onSave}
        value="save"
      >
        画像で保存
      </MenuItem>
    </PullDownMenu>
  );
}

function PagedShifts({
  group,
  header,
  layout,
  month,
  monthNav,
  dates,
  picked,
  onMonth,
  onPickDay,
  onMember,
}: {
  group: Group;
  // The page's header, pinned with the month over a list of months.
  header: ReactNode;
  layout: Layout;
  month: Date;
  monthNav: MonthNav;
  dates: Date[];
  picked?: Date;
  onMonth: (month: Date) => void;
  onPickDay: (date: Date) => void;
  onMember: (member: Member) => void;
}) {
  const { weekStart } = useWeek();
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
  if (monthNav === "title" && layout !== "person") {
    // Remounted per layout and week start, so each opens where the other
    // left off, with its weeks as the settings draw them.
    return (
      <ScrollingShifts
        group={group}
        header={header}
        key={`${layout}-${weekStart}`}
        layout={layout}
        month={month}
        onMember={onMember}
        onMonth={onMonth}
        onPickDay={onPickDay}
        picked={picked}
      />
    );
  }
  if (monthNav === "title") {
    return (
      <>
        <PeoplePicker
          members={group.members}
          onPick={setPersonId}
          picked={person}
        />
        <MonthRow
          month={month}
          onPick={onMonth}
          onToday={
            thisMonth
              ? undefined
              : () => {
                  onMonth(monthAfter(designToday, 0));
                }
          }
          unit="月"
        />
        <PersonPager
          group={group}
          member={person}
          month={month}
          onMonth={onMonth}
          onPickDay={onPickDay}
          picked={picked}
        />
        <TogetherSummary
          days={offDays}
          label={`${thisMonth ? "今月" : `${month.getMonth() + 1}月`}のみんな休み`}
          onPickDay={onPickDay}
        />
      </>
    );
  }
  return (
    <>
      {layout === "person" && (
        <PeoplePicker
          members={group.members}
          onPick={setPersonId}
          picked={person}
        />
      )}
      <div className={shiftsPage.month}>
        <span />
        <div className={monthSwitch.bar({ inRow: true })}>
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
        <TodayButton
          className={css({ justifySelf: "end" })}
          disabled={thisMonth}
          onClick={() => {
            onMonth(
              new Date(designToday.getFullYear(), designToday.getMonth(), 1)
            );
          }}
          unit="月"
        />
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
        <Note>
          アイコンを押すとその人のシフトパターン、マスを押すとその日のみんなの予定が見られます。
        </Note>
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
      <div className={summaryRow.row}>
        <span>{label}</span>
        <span className={shiftsPage.togetherNone}>なし</span>
      </div>
    );
  }
  return (
    <>
      <SummaryRow
        days={days.length}
        label={label}
        onOpen={() => {
          setOpen(true);
        }}
      />
      <TogetherSheet
        days={days}
        label={label}
        onOpenChange={setOpen}
        onPickDay={onPickDay}
        open={open}
      />
    </>
  );
}

// The days everyone is off in a month, a date to a row.
function TogetherSheet({
  label,
  days,
  open,
  onOpenChange,
  onPickDay,
}: {
  label: string;
  days: Date[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickDay: (date: Date) => void;
}) {
  return (
    <Sheet label={label} onOpenChange={onOpenChange} open={open}>
      <SheetHeading
        onClose={() => {
          onOpenChange(false);
        }}
        title={label}
      />
      {/* Picking a date closes this and shows everyone that day. */}
      <div className={sheetBody}>
        <List>
          {days.map((date) => (
            <ListRow
              key={dateKey(date)}
              onClick={() => {
                onOpenChange(false);
                onPickDay(date);
              }}
              label={formatDay(date)}
              value={holidayName(date) ?? ""}
            />
          ))}
        </List>
      </div>
    </Sheet>
  );
}

type MonthNav = DesignVariants["monthNav"];

function monthKey(month: Date) {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}

// The 1st of the month `count` months on from the date's.
function monthAfter(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function daysOf(month: Date) {
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  return Array.from(
    { length: count },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)
  );
}

// A computed length in pixels, as "40px"; 0 for one like "auto".
function pixels(length: string) {
  return Number(length.replace("px", "")) || 0;
}

// Where the rows pinned at the top of the scroll end, once pinned.
function pinnedBottom(root: HTMLElement) {
  const { top } = root.getBoundingClientRect();
  const padding = pixels(getComputedStyle(root).paddingTop);
  let bottom = top;
  for (const pinned of root.querySelectorAll<HTMLElement>("[data-pinned]")) {
    const offset = pixels(getComputedStyle(pinned).top);
    bottom = Math.max(bottom, top + padding + offset + pinned.offsetHeight);
  }
  return bottom;
}

// How many months either side of today the list of months holds, as the
// native lists will: all there, drawn only as they come into sight.
const monthSpan = 24;
// Rough heights until a row is drawn and measured.
const headingEstimate = 52;
const dayRowEstimate = 37;
const weekRowEstimate = 40;
const weekGap = 12;

// A row of the list of months: a month's heading, or its days, one day
// for 日ごと and a week for 週ごと.
type MonthListRow =
  | { kind: "heading"; key: string; month: Date }
  | { kind: "days"; key: string; month: Date; days: Date[] };

// Every month of the span under its heading. A week belongs to the month
// it ends in, so a month's heading comes before the week of its 1st.
function monthListRows(
  layout: Layout,
  weekDates: (date: Date) => Date[]
): MonthListRow[] {
  const rows: MonthListRow[] = [];
  for (let offset = -monthSpan; offset <= monthSpan; offset += 1) {
    const month = monthAfter(designToday, offset);
    rows.push({ key: monthKey(month), kind: "heading", month });
    if (layout === "days") {
      for (const date of daysOf(month)) {
        rows.push({ days: [date], key: dateKey(date), kind: "days", month });
      }
      continue;
    }
    let week = weekDates(month);
    while (sameMonth(week[weekLength - 1], month)) {
      rows.push({ days: week, key: dateKey(week[0]), kind: "days", month });
      const end = week[weekLength - 1];
      week = weekDates(
        new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
      );
    }
  }
  return rows;
}

// 日ごと and 週ごと as one list of months, as the platforms' calendar lists
// scroll: each month under its heading with its みんな休み, two years
// either side of today, only the rows in sight drawn (TanStack Virtual, as
// LazyVStack and LazyColumn). The month in sight names itself in the row
// pinned on top, whose name opens a choice of months, and 今日 comes back
// to today when it is out of sight. It opens on the day asked for, or on
// today, or on the month.
function ScrollingShifts({
  group,
  header,
  layout,
  month,
  picked,
  onMonth,
  onPickDay,
  onMember,
}: {
  group: Group;
  header: ReactNode;
  layout: Layout;
  month: Date;
  picked?: Date;
  onMonth: (month: Date) => void;
  onPickDay: (date: Date) => void;
  onMember: (member: Member) => void;
}) {
  const weekTools = useWeek();
  const bodyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Where the rows start: the list's first element.
  const listRef = useRef<HTMLElement>(null);
  const [rows] = useState(() => monthListRows(layout, weekTools.weekDates));
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  // Where the list starts in the scroll, and how much is pinned over it.
  const [offsets, setOffsets] = useState({ margin: 0, pinned: 0 });
  const density = densityOf(group.members.length);
  const indexOfDay = (date: Date) =>
    rows.findIndex(
      (row) =>
        row.kind === "days" &&
        row.days.some((day) => dateKey(day) === dateKey(date))
    );
  const indexOfMonth = (target: Date) => {
    const key = monthKey(target);
    return rows.findIndex((row) => row.kind === "heading" && row.key === key);
  };
  const todayIndex = indexOfDay(designToday);
  const [openIndex] = useState(() => {
    if (picked) {
      return indexOfDay(picked);
    }
    return sameMonth(month, designToday) &&
      month.getFullYear() === designToday.getFullYear()
      ? todayIndex
      : indexOfMonth(month);
  });
  // oxlint-disable-next-line react/incompatible-library -- the app does not run the React Compiler, which this warns about.
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      if (rows[index].kind === "heading") {
        return headingEstimate;
      }
      return layout === "days"
        ? dayRowEstimate
        : (group.members.length + 1) * weekRowEstimate;
    },
    gap: layout === "weeks" ? weekGap : 0,
    getItemKey: (index) => rows[index].key,
    getScrollElement: () => scrollElement,
    overscan: 6,
    scrollMargin: offsets.margin,
    scrollPaddingStart: offsets.pinned,
  });
  // The screen scrolls the list, or the table's own frame for a big group.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    setScrollElement(
      body?.querySelector<HTMLElement>("[data-table-scroll]") ??
        body?.closest<HTMLElement>("[data-screen-scroll]") ??
        null
    );
  }, []);
  // The tables' own pinned rows go under the bar, however tall it is, and
  // the list learns where it starts and what is pinned over it.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const bar = barRef.current;
    if (!(body && bar && scrollElement)) {
      return;
    }
    const place = () => {
      body.style.setProperty("--pinned-top", `${bar.offsetHeight - 8}px`);
      const { top } = scrollElement.getBoundingClientRect();
      const margin =
        (listRef.current?.getBoundingClientRect().top ?? top) -
        top +
        scrollElement.scrollTop;
      const pinned = pinnedBottom(scrollElement) - top;
      setOffsets((previous) =>
        previous.margin === margin && previous.pinned === pinned
          ? previous
          : { margin, pinned }
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    return () => {
      observer.disconnect();
    };
  }, [scrollElement]);
  // Once it knows where it starts, it opens on its day or month.
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || !scrollElement || offsets.margin === 0) {
      return;
    }
    opened.current = true;
    virtualizer.scrollToIndex(openIndex, { align: "start" });
  });
  const items = virtualizer.getVirtualItems();
  const scrolled = virtualizer.scrollOffset ?? 0;
  const line = scrolled + offsets.pinned;
  const top = items.find((item) => item.end > line);
  const shown = top ? rows[top.index].month : month;
  const shownKey = monthKey(shown);
  const todayItem = items.find((item) => item.index === todayIndex);
  const todayInSight =
    todayItem !== undefined &&
    todayItem.end > line &&
    todayItem.start < scrolled + (scrollElement?.clientHeight ?? 0);
  // The page's month follows the month in sight, as for its save.
  const reportMonth = useEffectEvent((key: string) => {
    if (opened.current && key !== monthKey(month)) {
      onMonth(shown);
    }
  });
  useEffect(() => {
    reportMonth(shownKey);
  }, [shownKey]);
  const go = (index: number) => {
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "start" });
    }
  };
  const first = monthAfter(designToday, -monthSpan);
  const last = monthAfter(designToday, monthSpan);
  const total = virtualizer.getTotalSize();
  const before = items.length > 0 ? items[0].start - offsets.margin : 0;
  const after =
    items.length > 0 ? total - ((items.at(-1)?.end ?? 0) - offsets.margin) : 0;
  const isPicked = (date: Date) =>
    picked !== undefined && dateKey(picked) === dateKey(date);
  const heading = (row: MonthListRow) => (
    <MonthDivider
      days={daysOf(row.month).filter((date) =>
        everyoneOff(group.members, date)
      )}
      month={row.month}
      onPickDay={onPickDay}
    />
  );
  const columns = group.members.length + 1;
  const dayRowsBody = (
    <>
      <tr aria-hidden="true" ref={listRef as Ref<HTMLTableRowElement>}>
        <td
          aria-hidden="true"
          className={dayRows.spacer}
          colSpan={columns}
          style={{ height: before }}
        />
      </tr>
      {items.map((item) => {
        const row = rows[item.index];
        if (row.kind === "heading") {
          return (
            <tr
              data-index={item.index}
              key={item.key}
              ref={virtualizer.measureElement}
            >
              <td className={dayRows.divider} colSpan={columns}>
                {heading(row)}
              </td>
            </tr>
          );
        }
        const [date] = row.days;
        return (
          <DayRow
            date={date}
            index={item.index}
            key={item.key}
            last={false}
            members={group.members}
            onPick={onPickDay}
            picked={isPicked(date)}
            rowRef={virtualizer.measureElement}
            scrolls={density === "scroll"}
            withNames={density === "names"}
          />
        );
      })}
      <tr aria-hidden="true">
        <td
          aria-hidden="true"
          className={dayRows.spacer}
          colSpan={columns}
          style={{ height: after }}
        />
      </tr>
    </>
  );
  const weeksBody = (
    <div
      className={weekTable.list}
      ref={listRef as Ref<HTMLDivElement>}
      style={{ height: total }}
    >
      {items.map((item) => {
        const row = rows[item.index];
        return (
          <div
            className={weekTable.item}
            data-index={item.index}
            key={item.key}
            ref={virtualizer.measureElement}
            style={{
              transform: `translateY(${item.start - offsets.margin}px)`,
            }}
          >
            {row.kind === "heading" ? (
              <div className={weekTable.divider}>{heading(row)}</div>
            ) : (
              <WeekBlock
                group={group}
                onMember={onMember}
                onPickDay={onPickDay}
                picked={picked}
                week={row.days}
              />
            )}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className={shiftsPage.scrolling} ref={bodyRef}>
      <div className={shiftsPage.bar} data-pinned="" ref={barRef}>
        {header}
        <MonthRow
          first={first}
          last={last}
          month={shown}
          onPick={(target) => {
            go(indexOfMonth(target));
          }}
          onToday={
            todayInSight
              ? undefined
              : () => {
                  go(todayIndex);
                }
          }
          unit="日"
        />
      </div>
      {layout === "days" ? (
        <DayRowsTable
          body={dayRowsBody}
          days={daysOf(shown)}
          group={group}
          onMember={onMember}
          onPickDay={onPickDay}
          picked={picked}
        />
      ) : (
        <MemberTable
          body={weeksBody}
          dates={[]}
          group={group}
          onMember={onMember}
          onPickDay={onPickDay}
          picked={picked}
        />
      )}
    </div>
  );
}

const monthDivider = {
  name: css({ fontWeight: 600, margin: 0, textStyle: "headline" }),
  none: css({ color: "text3", textStyle: "subheadline" }),
  root: css({ alignItems: "baseline", display: "flex", gap: "12px" }),
  together: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "accent",
    display: "inline-flex",
    fontWeight: 600,
    gap: "2px",
    padding: 0,
    textStyle: "subheadline",
  }),
};

// The month's heading in the list of months, with its days everyone is
// off: how many, and the dates in a sheet.
function MonthDivider({
  month,
  days,
  onPickDay,
}: {
  month: Date;
  days: Date[];
  onPickDay: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const thisYear = month.getFullYear() === designToday.getFullYear();
  const name = thisYear
    ? `${month.getMonth() + 1}月`
    : `${month.getFullYear()}年${month.getMonth() + 1}月`;
  const label = `${
    thisYear && month.getMonth() === designToday.getMonth() ? "今月" : name
  }のみんな休み`;
  return (
    <div className={monthDivider.root}>
      <h4 className={monthDivider.name}>{name}</h4>
      {days.length === 0 ? (
        <span className={monthDivider.none}>みんな休み なし</span>
      ) : (
        <button
          aria-haspopup="dialog"
          className={monthDivider.together}
          onClick={() => {
            setOpen(true);
          }}
          type="button"
        >
          みんな休み {days.length}日
          <ChevronRight aria-hidden="true" size={14} />
        </button>
      )}
      <TogetherSheet
        days={days}
        label={label}
        onOpenChange={setOpen}
        onPickDay={onPickDay}
        open={open}
      />
    </div>
  );
}

// The shift table's month: its name, which opens a choice of months, and
// the way back to today's day or month while it is out of sight. Over a
// list of months, it names the month in sight.
function MonthRow({
  month,
  unit,
  first,
  last,
  onPick,
  onToday,
}: {
  month: Date;
  unit: "日" | "月";
  // The months there are to go to, when the list has ends.
  first?: Date;
  last?: Date;
  onPick: (month: Date) => void;
  // Left out while today's day or month is in sight.
  onToday?: () => void;
}) {
  return (
    <div className={shiftsPage.monthRow}>
      <MonthTitleButton first={first} last={last} month={month} onPick={onPick}>
        <strong className={shiftsPage.monthName}>
          {month.getFullYear()}年{month.getMonth() + 1}月
        </strong>
      </MonthTitleButton>
      {onToday && <TodayButton onClick={onToday} unit={unit} />}
    </div>
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
    button.closest("[data-screen-scroll]")?.scrollTo({ top: 0 });
  };
  return (
    <div className={monthSwitch.foot}>
      <button
        className={monthSwitch.footButton}
        onClick={(event) => {
          go(previous, event.currentTarget);
        }}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={16} />
        {previous.getMonth() + 1}月
      </button>
      <button
        className={monthSwitch.footButton}
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
  date: picked,
  members,
  onClose,
}: {
  date?: Date;
  members: Member[];
  onClose: () => void;
}) {
  // The day stays while the sheet sinks away.
  const [date, setDate] = useState(picked ?? designToday);
  if (picked && picked !== date) {
    setDate(picked);
  }
  const together = everyoneOff(members, date);
  return (
    <Sheet
      label={formatDay(date)}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={picked !== undefined}
    >
      <SheetHeading onClose={onClose} title={formatDay(date)}>
        {together && (
          <Tag size="sm" tone="accent">
            みんな休み
          </Tag>
        )}
      </SheetHeading>
      <div className={sheetBody}>
        <List>
          {members.map((member) => {
            const item = patternOn(member, date);
            return (
              <ListRow
                key={member.id}
                label={member.name}
                value={
                  <>
                    {item && (
                      <MemberMark
                        date={date}
                        look={item.look}
                        member={member}
                        size={18}
                      />
                    )}
                    {item?.name ?? "未入力"}
                    <DaySheetTime
                      change={changeOn(member, date)}
                      time={item?.time}
                    />
                  </>
                }
                leading={
                  <>
                    <Avatar member={member} />
                  </>
                }
                valueClassName={shiftsPage.sheetValue}
              />
            );
          })}
        </List>
      </div>
    </Sheet>
  );
}

// What each mark means, for one person or everyone, in their own style.
function LegendSheet({
  open,
  onOpenChange,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
}) {
  const single = members.length === 1 ? members[0] : undefined;
  const onClose = () => {
    onOpenChange(false);
  };
  return (
    <Sheet
      label={
        single ? `${single.name}のシフトパターン` : "みんなのシフトパターン"
      }
      onOpenChange={onOpenChange}
      open={open}
    >
      <SheetHeading
        onClose={onClose}
        title={
          <>
            {single && <Avatar member={single} />}
            {single
              ? `${single.name}のシフトパターン`
              : "みんなのシフトパターン"}
          </>
        }
      />
      {/* Only the marks scroll; the title and 閉じる stay in reach. */}
      <div className={sheetBody}>
        {members.map((member) => (
          <section key={member.id}>
            {!single && (
              <h4 className={cx(sectionTitle, shiftsPage.legendMember)}>
                <Avatar member={member} />
                {member.me ? "自分" : member.name}
              </h4>
            )}
            <List>
              {member.patterns.map((item) => (
                <ListRow
                  key={item.id}
                  label={item.name}
                  value={item.time ?? ""}
                  leading={
                    <>
                      <MemberMark look={item.look} member={member} size={20} />
                    </>
                  }
                />
              ))}
            </List>
          </section>
        ))}
      </div>
    </Sheet>
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
  body,
  picked,
  onMember,
  onPickDay,
}: {
  group: Group;
  days: Date[];
  // Rows a list of months draws in place of the month's days, under the
  // same pinned names.
  body?: ReactNode;
  picked?: Date;
  // Opens a member's legend from their face or name, as in 週ごと.
  onMember: (member: Member) => void;
  onPickDay: (date: Date) => void;
}) {
  const density = densityOf(group.members.length);
  const withNames = density === "names";
  // Up to seven the page scrolls; more scroll sideways in their frame,
  // the names and dates pinned.
  const page = density !== "scroll";
  const scrolls = density === "scroll";
  const columnWidth = withNames ? rowsMemberWidth : rowsMarkWidth;
  return (
    <div
      className={dayRows.scroll({ page })}
      data-table-scroll={page ? undefined : ""}
    >
      <table
        className={dayRows.table}
        style={{
          minWidth: rowsDateWidth + group.members.length * columnWidth,
        }}
      >
        <caption className={srOnly}>みんなのシフト</caption>
        <thead>
          <tr>
            <th
              className={dayRows.head({ corner: true, page })}
              data-pinned=""
              scope="col"
            >
              {/* Pinned with the names, so the month stays in sight; the
                  months one after another name theirs in their headings. */}
              {!body && (
                <span aria-hidden="true" className={cornerMonth}>
                  {days[0].getMonth() + 1}月
                </span>
              )}
              <span className={srOnly}>日付</span>
            </th>
            {group.members.map((member, column) => (
              <th
                className={dayRows.head({
                  last: column === group.members.length - 1,
                  me: member.me === true,
                  page,
                  scrolls,
                })}
                key={member.id}
                scope="col"
              >
                <button
                  aria-label={`${member.name}のシフトパターン`}
                  className={dayRows.member({ centered: !withNames })}
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
          {body ??
            days.map((date, row) => (
              <DayRow
                date={date}
                key={dateKey(date)}
                last={row === days.length - 1}
                members={group.members}
                scrolls={scrolls}
                onPick={onPickDay}
                picked={
                  picked !== undefined && dateKey(picked) === dateKey(date)
                }
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
  last,
  scrolls,
  onPick,
  index,
  rowRef,
}: {
  date: Date;
  members: Member[];
  withNames: boolean;
  picked: boolean;
  // The month's last day, whose cells drop the line under them.
  last: boolean;
  scrolls: boolean;
  onPick: (date: Date) => void;
  // Its place in a list of months, which measures it by this ref.
  index?: number;
  rowRef?: Ref<HTMLTableRowElement>;
}) {
  const together = everyoneOff(members, date);
  const today = dateKey(date) === dateKey(designToday);
  return (
    <tr data-index={index} ref={rowRef}>
      <th
        className={dayRows.date({ last, picked, today, together })}
        scope="row"
      >
        <RowDate
          date={date}
          onPick={() => {
            onPick(date);
          }}
          picked={picked}
        />
        {together && <span className={srOnly}>みんな休み</span>}
      </th>
      {members.map((member, column) => {
        const item = patternOn(member, date);
        return (
          <td
            className={dayRows.cell({
              end: column === members.length - 1,
              last,
              me: member.me === true,
              off: item?.off === true,
              picked,
              scrolls,
              together,
            })}
            key={member.id}
          >
            {/* The whole row picks the day, as the whole column does in
                週ごと. */}
            <button
              aria-label={`${formatDay(date)} ${member.name}：${item?.name ?? "未入力"}${changeOn(member, date) ? `、${movesOf(changeOn(member, date))}` : ""}。押すとその日のみんなの予定`}
              aria-pressed={picked}
              className={dayRows.cellButton}
              onClick={() => {
                onPick(date);
              }}
              type="button"
            >
              {item ? (
                <span className={dayRows.mark}>
                  <MemberMark
                    date={date}
                    look={item.look}
                    member={member}
                    size={16}
                  />
                  <span className={withNames ? dayRows.name : srOnly}>
                    {item.name}
                  </span>
                </span>
              ) : (
                <span className={dayRows.empty}>
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
  const weekTools = useWeek();
  const label = (
    <span className={toneColor[weekTools.dateTone(date)]}>
      {date.getDate()}
      <small className={dayRows.weekday}>{weekdayLabels[date.getDay()]}</small>
    </span>
  );
  if (!onPick) {
    return label;
  }
  return (
    <button
      aria-label={`${formatDay(date)}の予定を見る`}
      aria-pressed={picked}
      className={dayRows.dateButton}
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
  date,
}: {
  member: Member;
  look: Look;
  size: number;
  // The day it stands for, which brings its 早出 and 残業 with it.
  date?: Date;
}) {
  const change = date && changeOn(member, date);
  return (
    <MemberLook member={member}>
      <ViewerMark
        early={change?.early}
        late={change?.late}
        look={look}
        size={size}
      />
    </MemberLook>
  );
}

function ViewerMark({
  look,
  size,
  early,
  late,
}: {
  look: Look;
  size: number;
  early?: boolean;
  late?: boolean;
}) {
  const style = useContext(ShiftMarkStyleContext);
  return (
    <MarkGlyph
      early={early}
      late={late}
      look={look}
      size={size}
      style={style}
    />
  );
}

// 早出 and 残業 as words, like 早出・残業; empty when neither.
function movesOf(change: TimeChange | undefined) {
  if (!change) {
    return "";
  }
  return [change.early ? "早出" : "", change.late ? "残業" : ""]
    .filter(Boolean)
    .join("・");
}

// A member's hours in the day sheet: 早出 and 残業 said in words, with
// the day's actual hours instead of the pattern's.
function DaySheetTime({
  time,
  change,
}: {
  time?: string;
  change?: TimeChange;
}) {
  if (change) {
    return (
      <small className={shiftsPage.sheetTime}>
        <strong>{movesOf(change)}</strong> {change.time}
      </small>
    );
  }
  return time ? <small className={shiftsPage.sheetTime}>{time}</small> : null;
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
      className={avatar({ me })}
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
    return <span aria-hidden="true" className={emptyMark} />;
  }
  return (
    <MemberMark date={date} look={item.look} member={member} size={size} />
  );
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
  const weekTools = useWeek();
  const look = {
    kind: "date",
    outside: !(!month || sameMonth(date, month)),
    picked,
    together: everyoneOff(members, date),
    tone: weekTools.dateTone(date),
  } as const;
  // Without a month dimming the days around it, the 1st names its month,
  // as where one week runs into the next month.
  const label =
    !month && date.getDate() === 1
      ? `${date.getMonth() + 1}/1`
      : date.getDate();
  if (!onPick) {
    return <span className={weekCell(look)}>{label}</span>;
  }
  return (
    <button
      aria-label={`${formatDay(date)}の予定を見る`}
      aria-pressed={picked}
      className={weekCell({ ...look, button: true })}
      onClick={() => {
        onPick(date);
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function WeekCell({
  date,
  member,
  members,
  month,
  picked,
  compact,
  last,
  onPick,
}: {
  date: Date;
  member: Member;
  members: Member[];
  month?: Date;
  picked: boolean;
  compact: boolean;
  // The week's last person, where a shared day off and the frame end.
  last: boolean;
  onPick?: (date: Date) => void;
}) {
  const item = patternOn(member, date);
  const look = {
    compact,
    kind: "cell",
    last,
    off: item?.off === true,
    outside: !(!month || sameMonth(date, month)),
    picked,
    together: everyoneOff(members, date),
  } as const;
  const className = weekCell(look);
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
      className={weekCell({ ...look, button: true })}
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
  body,
  month,
  compact = false,
  onMember,
  onPickDay,
  picked,
}: {
  group: Group;
  dates: Date[];
  // Rows a list of months draws in place of the weeks, under the same
  // pinned weekdays.
  body?: ReactNode;
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
  const weekTools = useWeek();
  const weeks = Array.from({ length: dates.length / weekLength }, (_, row) =>
    dates.slice(row * weekLength, (row + 1) * weekLength)
  );
  return (
    <div className={weekTable.root}>
      <div
        aria-hidden="true"
        className={cx(
          weekTable.row({ compact }),
          weekTable.weekdays({ pinned: !compact })
        )}
        data-pinned={compact ? undefined : ""}
      >
        {/* Pinned above the weeks, so the month stays in sight; a list of
            months names its months in their headings. */}
        <span className={cornerMonth}>
          {month && !compact && !body ? `${month.getMonth() + 1}月` : ""}
        </span>
        {weekTools.weekdays.map((day) => (
          <span className={toneColor[day.tone]} key={day.day}>
            {day.label}
          </span>
        ))}
      </div>
      {body ??
        weeks.map((week) => (
          <WeekBlock
            compact={compact}
            group={group}
            key={dateKey(week[0])}
            month={month}
            onMember={onMember}
            onPickDay={onPickDay}
            picked={picked}
            week={week}
          />
        ))}
    </div>
  );
}

// One week of 週ごと: its dates, then a row per member.
function WeekBlock({
  group,
  week,
  month,
  compact = false,
  picked,
  onMember,
  onPickDay,
}: {
  group: Group;
  week: Date[];
  month?: Date;
  compact?: boolean;
  picked?: Date;
  onMember?: (member: Member) => void;
  onPickDay?: (date: Date) => void;
}) {
  // Short rows in the card: smaller faces keep a gap between them, the
  // height of the day-off tiles beside them.
  const avatarSize = compact ? compactAvatarSize : undefined;
  const isPicked = (date: Date) =>
    picked !== undefined && dateKey(picked) === dateKey(date);
  return (
    <section
      aria-label={`${formatDay(week[0])}からの週`}
      className={weekTable.week({ compact })}
    >
      <div className={cx(weekTable.row({ compact }), weekTable.dates)}>
        <span />
        {week.map((date) => (
          <WeekDate
            date={date}
            key={dateKey(date)}
            members={group.members}
            month={month}
            onPick={onPickDay}
            picked={isPicked(date)}
          />
        ))}
      </div>
      {group.members.map((member, row) => (
        <div className={weekTable.row({ compact })} key={member.id}>
          {onMember ? (
            <button
              aria-label={`${member.name}のシフトパターン`}
              className={cx(weekTable.name, weekTable.nameButton)}
              onClick={() => {
                onMember(member);
              }}
              type="button"
            >
              <Avatar member={member} size={avatarSize} />
            </button>
          ) : (
            <span className={weekTable.name}>
              <Avatar member={member} size={avatarSize} />
              <span className={srOnly}>{member.name}</span>
            </span>
          )}
          {week.map((date) => (
            <WeekCell
              compact={compact}
              date={date}
              key={dateKey(date)}
              last={row === group.members.length - 1}
              member={member}
              members={group.members}
              month={month}
              onPick={onPickDay}
              picked={isPicked(date)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

// Matches the side padding of the people list, so a scrolled-to person keeps
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
  const listRef = useRef<HTMLDivElement>(null);
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
    <ChoiceGrid
      className={people.list}
      label="表示する人"
      onValueChange={onPick}
      ref={listRef}
      value={picked.id}
    >
      {members.map((member) => (
        <Choice
          className={people.choice}
          data-member={member.id}
          key={member.id}
          value={member.id}
        >
          <Avatar member={member} />
          {member.name}
        </Choice>
      ))}
    </ChoiceGrid>
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
  return (
    <>
      {/* The same grid and cells as your own calendar, so the two read
          alike; one wrapper keeps the page's gap from splitting them. */}
      <div>
        <WeekdayRow />
        <PersonGrid
          dates={dates}
          group={group}
          member={member}
          month={month}
          onPickDay={onPickDay}
          picked={picked}
        />
      </div>
      <PersonNote member={member} />
    </>
  );
}

// 人ごと that a swipe turns, as the calendar tab: the weekdays stay and
// the months go by under them.
function PersonPager({
  group,
  member,
  month,
  picked,
  onMonth,
  onPickDay,
}: {
  group: Group;
  member: Member;
  month: Date;
  picked?: Date;
  onMonth: (month: Date) => void;
  onPickDay: (date: Date) => void;
}) {
  const weekTools = useWeek();
  return (
    <>
      <div>
        <WeekdayRow />
        <Pager
          onStep={(direction) => {
            onMonth(monthAfter(month, direction));
          }}
          page={monthKey(month)}
          renderPage={(offset) => {
            const shown = monthAfter(month, offset);
            return (
              <PersonGrid
                dates={weekTools.monthDates(shown)}
                group={group}
                member={member}
                month={shown}
                onPickDay={onPickDay}
                picked={picked}
              />
            );
          }}
        />
      </div>
      <PersonNote member={member} />
    </>
  );
}

function PersonGrid({
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
  onPickDay: (date: Date) => void;
}) {
  const me = group.members.find((item) => item.me);
  return (
    <div className={dayGrid}>
      <MemberLook member={member}>
        {dates.map((date) => (
          <PersonDay
            date={date}
            key={dateKey(date)}
            me={me}
            member={member}
            onPick={onPickDay}
            outside={!sameMonth(date, month)}
            picked={picked !== undefined && dateKey(picked) === dateKey(date)}
          />
        ))}
      </MemberLook>
    </div>
  );
}

function PersonNote({ member }: { member: Member }) {
  return (
    <Note>
      {member.me ? "" : "薄い枠の日は、自分も休みの日です。"}
      日付を押すと、その日のみんなの予定が見られます。
    </Note>
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
  const { isColoredHoliday } = useWeek();
  const item = outside ? undefined : patternOn(member, date);
  // In their カラー, like their marks.
  const { tint } = useDisplayColor(item?.look.color ?? 0);
  const withMe =
    !(outside || member.me) &&
    me !== undefined &&
    everyoneOff([me, member], date);
  const off = item?.off === true;
  // The calendar's own day, with a frame when you are off too.
  // Framed when you are off too, unless the picked day's own frame is on
  // it: the styles are merged, as two classes for one property would leave
  // the winner to the stylesheet's order.
  const className = css(
    dayCell.raw({ active: picked, off, outside }),
    withMe && !picked
      ? { outline: "1.5px solid var(--accent-muted)", outlineOffset: "-1px" }
      : {}
  );
  const style = off ? ({ "--off-tint": tint } as CSSProperties) : undefined;
  const content = (
    <>
      <span
        className={cx(
          dayParts.date,
          outside && dayParts.dateOutside,
          isColoredHoliday(date) && dayParts.holiday
        )}
      >
        {date.getDate()}
      </span>
      {item && (
        <>
          <span className={dayParts.mark}>
            <MemberMark
              date={date}
              look={item.look}
              member={member}
              size={21}
            />
          </span>
          <span className={dayParts.label}>{item.name}</span>
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
      data-active={picked || undefined}
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

// A group's invitation, as its link carries it.
type Invite = {
  group: string;
  mark: GroupMark;
  from: { name: string; photo?: string };
  members: { name: string; photo?: string }[];
};

// The group the sample invitation joins.
const invitedGroupId = "cousins";

const sampleInvite = (): Invite => ({
  from: { name: "ゆうき", photo: samplePhoto(1005) },
  group: "いとこ会",
  mark: { emoji: "🍉", kind: "emoji" },
  members: [
    { name: "ゆうき", photo: samplePhoto(1005) },
    { name: "あかり" },
    { name: "りく" },
  ],
});

const settleMilliseconds = 400;

// Asked whenever an invitation link is opened, and right after the first
// setup if one was opened during it: the one place anyone joins from a
// link. The name starts as the usual one and is what the group will see.
export function JoinSheet({
  name: usualName,
  onOpenGroup,
  afterScan = false,
}: {
  name: string;
  onOpenGroup: (groupId: string) => void;
  // Read from a QR code in the group tab: it opens at once, and joining
  // goes straight to the group instead of a second sheet saying so.
  afterScan?: boolean;
}) {
  const invite = sampleInvite();
  const [name, setName] = useState(usualName);
  const [joined, setJoined] = useState(false);
  const phone = useContext(PhoneContext);
  const groups = useUser((state) => state.groups);
  const setGroups = useUser((state) => state.setGroups);
  const already = groups.some((item) => item.id === invitedGroupId);
  // Opened again for a group you are in, rather than just joined.
  const alreadyIn = already && !joined;
  const [open, setOpen] = useState(false);
  // It opens by itself, so it waits for the page to settle, and on /design
  // brings the phone into view first.
  useEffect(() => {
    const timer = setTimeout(
      () => {
        phone?.current?.scrollIntoView({ behavior: "instant", block: "start" });
        setOpen(true);
      },
      afterScan ? 0 : settleMilliseconds
    );
    return () => {
      clearTimeout(timer);
    };
  }, [phone, afterScan]);
  const close = () => {
    setOpen(false);
  };
  return (
    <Sheet
      className={join.sheet}
      label={`「${invite.group}」への招待`}
      onOpenChange={setOpen}
      open={open}
    >
      <span className={markFrame({ size: "large" })}>
        <GroupIcon mark={invite.mark} size={40} />
      </span>
      {alreadyIn && (
        <>
          <h4 className={join.title}>
            「{invite.group}」にはもう参加しています
          </h4>
          <p className={join.text}>
            このリンクのグループに、もう入っています。
          </p>
          <Button
            variant="primary"
            className={pushToBottom}
            onClick={() => {
              close();
              onOpenGroup(invitedGroupId);
            }}
          >
            グループを見る
          </Button>
          <Button variant="text" onClick={close}>
            閉じる
          </Button>
        </>
      )}
      {!alreadyIn &&
        (joined ? (
          <>
            <h4 className={join.title}>「{invite.group}」に参加しました</h4>
            <p className={join.text}>
              みんなのシフトと、みんなが休みの日が見られます。
            </p>
            <Button
              variant="primary"
              className={pushToBottom}
              onClick={() => {
                close();
                onOpenGroup(invitedGroupId);
              }}
            >
              グループを見る
            </Button>
            <Button variant="text" onClick={close}>
              閉じる
            </Button>
          </>
        ) : (
          <>
            <p className={join.from}>
              <PhotoAvatar
                name={invite.from.name}
                photo={invite.from.photo}
                size={20}
              />
              {invite.from.name}からの招待
            </p>
            <h4 className={join.title}>「{invite.group}」に参加しますか？</h4>
            <div className={join.members}>
              {invite.members.map((member) => (
                <PhotoAvatar
                  key={member.name}
                  name={member.name}
                  photo={member.photo}
                  size={28}
                />
              ))}
              <small>{invite.members.length}人が参加中</small>
            </div>
            <List className={join.name}>
              <ListRow
                label="あなたの名前"
                control={
                  <>
                    <input
                      className={inlineInput}
                      onChange={(event) => {
                        setName(event.target.value);
                      }}
                      placeholder="例：さくら"
                      value={name}
                    />
                  </>
                }
              />
            </List>
            <p className={join.text}>
              このグループの人に、この名前で表示されます。参加すると、あなたのシフトもメンバーに見えるようになります。
            </p>
            <Button
              variant="primary"
              className={pushToBottom}
              disabled={name.trim() === ""}
              onClick={() => {
                setJoined(true);
                if (afterScan) {
                  close();
                  onOpenGroup(invitedGroupId);
                }
                if (!already) {
                  setGroups([
                    ...groups,
                    {
                      id: invitedGroupId,
                      mark: invite.mark,
                      // A name other than the usual one is this group's own.
                      mine:
                        name.trim() === usualName
                          ? undefined
                          : { name: name.trim() },
                      name: invite.group,
                    },
                  ]);
                }
              }}
            >
              参加する
            </Button>
            <Button variant="text" onClick={close}>
              今はしない
            </Button>
          </>
        ))}
    </Sheet>
  );
}

// A picture with one way in, as in other apps: tapping it or the link
// under it opens a sheet to take or pick a photo, and to go back to the
// usual one or delete it when that applies.
function PhotoPicker({
  picture,
  label,
  onPhoto,
  onUsual,
  onRemove,
}: {
  picture: ReactNode;
  label: string;
  onPhoto: (photo: string) => void;
  // A group's own picture can go back to the usual one.
  onUsual?: () => void;
  // Shown while there is a picture to delete.
  onRemove?: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const cameraId = useId();
  const libraryId = useId();
  const open = () => {
    setSheetOpen(true);
  };
  const close = () => {
    setSheetOpen(false);
  };
  const choose = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      onPhoto(URL.createObjectURL(file));
    }
    close();
  };
  return (
    <div className={photoPicker.root}>
      <input
        accept="image/*"
        capture="user"
        className={srOnly}
        id={cameraId}
        onChange={(event) => {
          choose(event.target.files);
        }}
        type="file"
      />
      <input
        accept="image/*"
        className={srOnly}
        id={libraryId}
        onChange={(event) => {
          choose(event.target.files);
        }}
        type="file"
      />
      <button
        aria-label={label}
        className={photoPicker.edit}
        onClick={open}
        type="button"
      >
        {picture}
        <span aria-hidden="true" className={photoPicker.badge}>
          <Camera size={14} />
        </span>
      </button>
      <button className={photoPicker.action} onClick={open} type="button">
        {label}
      </button>
      <Sheet label={label} onOpenChange={setSheetOpen} open={sheetOpen}>
        <List>
          <ListRow
            htmlFor={cameraId}
            label="写真を撮る"
            leading={
              <>
                <Camera aria-hidden="true" size={20} />
              </>
            }
          />
          <ListRow
            htmlFor={libraryId}
            label="写真を選ぶ"
            leading={
              <>
                <ImageIcon aria-hidden="true" size={20} />
              </>
            }
          />
          {onUsual && (
            <ListRow
              onClick={() => {
                onUsual();
                close();
              }}
              label="いつもの写真に戻す"
              leading={
                <>
                  <RotateCcw aria-hidden="true" size={20} />
                </>
              }
            />
          )}
          {onRemove && (
            <ListRow
              onClick={() => {
                onRemove();
                close();
              }}
              label="写真を削除"
              leading={
                <>
                  <Trash2 aria-hidden="true" size={20} />
                </>
              }
              danger
            />
          )}
        </List>
        <button className={photoPicker.cancel} onClick={close} type="button">
          キャンセル
        </button>
      </Sheet>
    </div>
  );
}

// Your picture: a photo from the device, or the first letter of your name.
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
  onRemove?: () => void;
  onUsual?: () => void;
}) {
  return (
    <PhotoPicker
      label="写真を編集"
      onPhoto={onUpload}
      onRemove={onRemove}
      onUsual={onUsual}
      picture={<PhotoAvatar name={name} photo={photo} size={size} />}
    />
  );
}

// How you appear in one group, starting from your usual profile, and who
// else is in it.
function GroupSettingsPage({
  group,
  profile,
  onChange,
  onEdit,
  onInvite,
  onBack,
  onMember,
  onLeave,
}: {
  group: Group;
  profile: Profile;
  onMember?: (member: Member) => void;
  onLeave: () => void;
  onChange: (mine: GroupProfile | undefined) => void;
  onEdit: (edit: GroupEdit) => void;
  onInvite: () => void;
  onBack: () => void;
}) {
  const [view, setView] = useState<"settings" | "edit" | "profile">("settings");
  const [leaving, setLeaving] = useState(false);
  const shown = profileIn(group, profile);
  if (view === "edit") {
    return (
      <GroupEditPage
        group={group}
        onCancel={() => {
          setView("settings");
        }}
        onSave={(edit) => {
          onEdit(edit);
          setView("settings");
        }}
      />
    );
  }
  if (view === "profile") {
    return (
      <GroupProfilePage
        group={group}
        onBack={() => {
          setView("settings");
        }}
        onChange={onChange}
        profile={profile}
      />
    );
  }
  return (
    <>
      <PageHeader back={group.name} onBack={onBack} title="グループの設定" />
      <Section title="グループ">
        <List>
          <ListRow
            onClick={() => {
              setView("edit");
            }}
            label={group.name}
            value="編集"
            leading={
              <>
                <span className={smallMarkFrame}>
                  <GroupIcon mark={group.mark} size={16} />
                </span>
              </>
            }
          />
        </List>
        <Note>グループ名とアイコンは、メンバー全員に表示されます。</Note>
      </Section>
      <Section title="このグループでのあなた">
        <List>
          <ListRow
            onClick={() => {
              setView("profile");
            }}
            label={shown.name}
            value={group.mine ? "このグループだけ" : "いつもと同じ"}
            leading={
              <>
                <PhotoAvatar name={shown.name} photo={shown.photo} size={28} />
              </>
            }
          />
        </List>
      </Section>
      <Section title="メンバー">
        <List>
          {group.members.map((member) => (
            <ListRow
              key={member.id}
              label={<>{member.me ? `${shown.name}（自分）` : member.name}</>}
              onClick={
                onMember && !member.me
                  ? () => {
                      onMember(member);
                    }
                  : undefined
              }
              leading={
                <>
                  <Avatar member={member} />
                </>
              }
            />
          ))}
          <ListRow
            onClick={onInvite}
            label="メンバーを招待"
            leading={
              <>
                <UserPlus
                  aria-hidden="true"
                  className={hub.rowIcon}
                  size={18}
                />
              </>
            }
          />
        </List>
      </Section>
      <DestructiveButton
        onClick={() => {
          setLeaving(true);
        }}
      >
        このグループから抜ける
      </DestructiveButton>
      {leaving && (
        <ConfirmDialog
          action="抜ける"
          message={`「${group.name}」のシフトとチャットが見られなくなります。もう一度入るには、招待してもらう必要があります。`}
          onCancel={() => {
            setLeaving(false);
          }}
          onConfirm={() => {
            setLeaving(false);
            onLeave();
          }}
          title="グループから抜けますか？"
        />
      )}
    </>
  );
}

type GroupEdit = { name: string; mark: GroupMark };

// The line the group chat gets when someone saves a new name or icon.
function editNotice(by: string, before: GroupEdit, after: GroupEdit) {
  const renamed = before.name !== after.name;
  const remarked = JSON.stringify(before.mark) !== JSON.stringify(after.mark);
  if (renamed && remarked) {
    return `${by}がグループ名を「${after.name}」にして、アイコンを変更しました`;
  }
  if (renamed) {
    return `${by}がグループ名を「${after.name}」に変更しました`;
  }
  return `${by}がグループのアイコンを変更しました`;
}

function timeNow() {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// The group's name and icon, which everyone in it sees: changes stay a
// draft until 保存, so picking a photo or an emoji on the way reaches no
// one.
function GroupEditPage({
  group,
  onCancel,
  onSave,
}: {
  group: GroupEdit;
  onCancel: () => void;
  onSave: (edit: GroupEdit) => void;
}) {
  const [name, setName] = useState(group.name);
  const [mark, setMark] = useState(group.mark);
  const [editingMark, setEditingMark] = useState(false);
  const draft = { mark, name: name.trim() };
  const changed =
    draft.name !== group.name ||
    JSON.stringify(mark) !== JSON.stringify(group.mark);
  const canSave = changed && draft.name !== "";
  if (editingMark) {
    return (
      <GroupMarkPage
        back="グループを編集"
        mark={mark}
        name={name}
        onBack={() => {
          setEditingMark(false);
        }}
        onChange={setMark}
      />
    );
  }
  return (
    <>
      <PageHeader
        leading={
          <IconButton label="キャンセル" onClick={onCancel}>
            <X aria-hidden="true" size={22} />
          </IconButton>
        }
        trailing={
          <HeaderAction
            disabled={!canSave}
            prominent
            onClick={() => {
              onSave(draft);
            }}
          >
            保存
          </HeaderAction>
        }
        title="グループを編集"
      />
      <div className={hub.editMark}>
        <span className={markFrame({ size: "large" })}>
          <GroupIcon mark={mark} size={40} />
        </span>
      </div>
      <List>
        <ListRow
          label="グループ名"
          control={
            <>
              <input
                className={inlineInput}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="例：家族"
                value={name}
              />
            </>
          }
        />
        <MarkRow
          mark={mark}
          onOpen={() => {
            setEditingMark(true);
          }}
        />
      </List>
      <Note>
        保存すると、メンバー全員の画面に反映され、グループのチャットにもお知らせが届きます。
      </Note>
    </>
  );
}

// How you appear in this group. It is yours, so changes apply at once. An
// empty name or no photo of its own means the usual ones from settings.
function GroupProfilePage({
  group,
  profile,
  onChange,
  onBack,
}: {
  group: Group;
  profile: Profile;
  onChange: (mine: GroupProfile | undefined) => void;
  onBack: () => void;
}) {
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
  return (
    <>
      <PageHeader
        back="グループの設定"
        onBack={onBack}
        title="グループでのあなた"
      />
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
        size={88}
      />
      <List className={hub.profileList}>
        <ListRow
          label="名前"
          control={
            <>
              <input
                className={inlineInput}
                onChange={(event) => {
                  update({ name: event.target.value || undefined });
                }}
                placeholder={profile.name}
                value={mine.name ?? ""}
              />
            </>
          }
        />
      </List>
      <Note>
        {group.name}
        の人にだけ、この名前と写真で表示されます。名前が空欄なら「{profile.name}
        」、写真を入れなければいつもの写真のままです。
      </Note>
    </>
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
  const [confirming, setConfirming] = useState(false);
  const toast = useContext(ToastContext);
  return (
    <>
      <PageHeader back={group.name} onBack={onBack} title="メンバーを招待" />
      <div className={hub.qr}>
        <QrCode aria-hidden="true" size={132} strokeWidth={1.2} />
        <small className={hub.qrNote}>
          この画面を相手に読み取ってもらいます
        </small>
      </div>
      <Button variant="primary">
        <Send aria-hidden="true" size={16} />
        招待リンクを送る
      </Button>
      <Button variant="quiet">
        <Copy aria-hidden="true" size={15} />
        リンクをコピー
      </Button>
      <Note>
        リンクを知っている人は、だれでも「{group.name}
        」に参加できます。送る相手に気をつけてください。
      </Note>
      <Button
        onClick={() => {
          setConfirming(true);
        }}
        variant="text"
      >
        招待リンクを作り直す
      </Button>
      {confirming && (
        <ConfirmDialog
          action="作り直す"
          message="今のリンクとQRコードでは、もう参加できなくなります。今いるメンバーはそのままです。"
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            toast("招待リンクを作り直しました");
          }}
          title="招待リンクを作り直しますか？"
        />
      )}
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
export function GroupIcon({
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
        className={markPart.photo}
        height={size}
        loading="lazy"
        src={mark.photo}
        width={size}
      />
    );
  }
  if (mark.kind === "emoji") {
    return (
      <span className={markPart.emoji} style={{ fontSize: size }}>
        {mark.emoji}
      </span>
    );
  }
  if (mark.kind === "letter") {
    return (
      <span
        className={markPart.letter}
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
      className={bare ? markPart.iconBare : markPart.icon}
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
  const [pickingEmoji, setPickingEmoji] = useState(false);
  const color = colorOfMark(mark);
  const letter = mark.kind === "letter" ? mark.text : firstLetter(name) || "グ";
  return (
    <>
      <PageHeader back={back} onBack={onBack} title="アイコン" />
      {/* Drawn marks are picked with the tabs below, so the sheet only
          brings in a photo. */}
      <PhotoPicker
        label={mark.kind === "photo" ? "写真を変更" : "写真を使う"}
        onPhoto={(photo) => {
          onChange({ kind: "photo", photo });
          setKind(undefined);
        }}
        picture={
          <span className={markFrame({ size: "large" })}>
            <GroupIcon mark={mark} size={40} />
          </span>
        }
      />
      <SegmentedControl
        label="アイコンの種類"
        onValueChange={setKind}
        value={kind ?? null}
      >
        {markKinds.map((option) => (
          <Segment key={option.kind} value={option.kind}>
            {option.label}
          </Segment>
        ))}
      </SegmentedControl>
      {kind === "emoji" && (
        <>
          <ChoiceGrid
            className={markGrid}
            label="絵文字"
            onValueChange={(emoji) => {
              onChange({ emoji, kind: "emoji" });
            }}
            value={mark.kind === "emoji" ? mark.emoji : null}
          >
            {withPicked(
              groupEmojis,
              mark.kind === "emoji" ? mark.emoji : undefined
            ).map((emoji) => (
              <Choice
                className={markPart.choiceEmoji}
                key={emoji}
                value={emoji}
              >
                {emoji}
              </Choice>
            ))}
          </ChoiceGrid>
          <OtherEmojiButton
            onClick={() => {
              setPickingEmoji(true);
            }}
          />
          <EmojiPickerSheet
            onOpenChange={setPickingEmoji}
            onPick={(emoji) => {
              onChange({ emoji, kind: "emoji" });
            }}
            open={pickingEmoji}
          />
        </>
      )}
      {kind === "icon" && (
        <>
          <ChoiceGrid
            className={markGrid}
            label="アイコン"
            onValueChange={(icon) => {
              onChange({ color, icon, kind: "icon" });
            }}
            value={mark.kind === "icon" ? mark.icon : null}
          >
            {groupIcons.map((icon) => (
              <Choice key={icon} label={iconNames[icon]} value={icon}>
                <GroupIcon
                  bare
                  mark={{ color, icon, kind: "icon" }}
                  size={22}
                />
              </Choice>
            ))}
          </ChoiceGrid>
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
          <List>
            <ListRow
              label="文字"
              control={
                <>
                  <input
                    className={inlineInput}
                    maxLength={2}
                    onChange={(event) => {
                      onChange({
                        color,
                        kind: "letter",
                        text: event.target.value,
                      });
                    }}
                    value={letter}
                  />
                </>
              }
            />
          </List>
          <MarkColors
            color={color}
            onPick={(value) => {
              onChange({ color: value, kind: "letter", text: letter });
            }}
          />
        </>
      )}
      <Note>
        メンバー全員に、このアイコンがそのまま表示されます。シフトの見た目のスタイルには左右されません。
      </Note>
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
    <ChoiceGrid
      className={colorGrid}
      label="色"
      labelClassName={fieldLabel({ place: "grid" })}
      onValueChange={(value) => {
        onPick(Number(value));
      }}
      value={String(color)}
    >
      {colors.map((option, index) => (
        <Choice
          key={option.name}
          label={option.name}
          style={{ background: option.tint, color: option.color }}
          value={String(index)}
        />
      ))}
    </ChoiceGrid>
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
      <PageHeader
        back="グループ"
        onBack={onBack}
        trailing={
          <HeaderAction
            disabled={!canCreate}
            prominent
            onClick={() => {
              onCreate({ mark, myName: myName.trim(), name: name.trim() });
            }}
          >
            作る
          </HeaderAction>
        }
        title="グループを作る"
      />
      <List>
        <ListRow
          label="グループ名"
          control={
            <>
              <input
                className={inlineInput}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!picked) {
                    setMark(guessGroupMark(event.target.value, color));
                  }
                }}
                placeholder="例：家族"
                value={name}
              />
            </>
          }
        />
        <MarkRow
          mark={mark}
          onOpen={() => {
            setEditingMark(true);
          }}
        />
        <ListRow
          label="このグループでの名前"
          control={
            <>
              <input
                className={inlineInput}
                onChange={(event) => {
                  setMyName(event.target.value);
                }}
                placeholder="例：さくら"
                value={myName}
              />
            </>
          }
        />
      </List>
      <Note>
        アイコンはグループ名から自動で入ります。このグループでの名前は、最初はいつもの名前です。写真はあとからグループの設定で変えられます。
      </Note>
    </>
  );
}

function MarkRow({ mark, onOpen }: { mark: GroupMark; onOpen: () => void }) {
  return (
    <ListRow
      onClick={onOpen}
      label="アイコン"
      value={
        <>
          <span className={smallMarkFrame}>
            <GroupIcon mark={mark} size={16} />
          </span>
        </>
      }
      valueClassName={markValue}
    />
  );
}
