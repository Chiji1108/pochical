import { siteOf } from "../lib/chat-text";
import { dateKey, timeChangeOf, timeRange } from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import { presetList } from "../lib/design-patterns";
import type { Pattern } from "../lib/design-patterns";
import { sampleRosterPhoto } from "../lib/design-sample-photos";
import type { Photo } from "../lib/design-sample-photos";
import { holidayName } from "./design-week";
import { guessLook, sampleLooks } from "./shift-mark";
import type { Look, LookSettings, MarkIcon } from "./shift-mark";

// The group screens' data: members, groups and chats as the prototype
// keeps them, the sample ones, and what is worked out from them (who is
// off when, days everyone is off).

// A pattern as another member set it up. Their looks come with them, and
// each viewer sees them in their own style.
type MemberPattern = {
  id: string;
  name: string;
  time?: string;
  off: boolean;
  look: Look;
};

export type Member = {
  id: string;
  name: string;
  me?: boolean;
  // The style they picked for their own calendar: its shape shows to
  // everyone as they chose it, in the viewer's テーマ.
  style?: { look: LookSettings };
  // A profile picture; without one the avatar shows the first letter.
  photo?: string;
  // Yours, as the others see you in this group: your avatar's letter
  // without a picture, where `name` says 自分.
  shownName?: string;
  patterns: MemberPattern[];
  shiftOn: (date: Date) => string | undefined;
  // 早出 and 残業, shared with the group like the shift itself, with the
  // day's actual hours.
  changeOn?: (date: Date) => TimeChange | undefined;
};

export type TimeChange = { early: boolean; late: boolean; time: string };

export function changeOn(member: Member, date: Date) {
  return member.changeOn?.(date);
}

export type Group = {
  id: string;
  name: string;
  mark: GroupMark;
  // How you appear in this group, when it differs from your usual profile.
  mine?: GroupProfile;
  // The chats that send you no notifications, by chat id: the group chat
  // (groupChat) or a member's one-to-one chat, each turned off on its own,
  // as LINE mutes a room. Yours alone, kept with your account so the
  // server leaves out the push.
  mutedChats?: string[];
  members: Member[];
};

// `noPhoto` hides the usual picture in this group without choosing another.
export type GroupProfile = { name?: string; photo?: string; noPhoto?: boolean };

export const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
export const designMonth = new Date(2026, 8, 1);
export const weekLength = 7;

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

export const partner: Member = {
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

export const mother: Member = {
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
export const misaki = (): Member => ({
  id: "misaki",
  name: "みさき",
  patterns: presetList(["day", "night", "after", "off"]).map(memberPatternOf),
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
  style: { look: presetLook("minimal") },
});

// あや made レッスン herself and never picked a look, so it has what the
// name alone gives it.
export const aya = (): Member => ({
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
      { color: 5, emoji: "🌇", icon: "cloudMoon" },
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
export const classmates = (): Member[] =>
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
// is the same person as in 家族. Five, more than the invitation names, so
// it shows ほか◯人 as a family's group usually would.
export const cousins = (): Member[] => [
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
  ...[
    ["cousin-sota", "そうた", 2, 1012, "pop"],
    ["cousin-yui", "ゆい", 5, 0, "natural"],
  ].map(([id, name, offset, photo, preset]) => ({
    ...misaki(),
    id: String(id),
    name: String(name),
    photo: photo ? samplePhoto(Number(photo)) : undefined,
    shiftOn: (date: Date) =>
      nurseOrder[(dayNumber(date) + Number(offset)) % nurseOrder.length],
    style: { look: presetLook(String(preset)) },
  })),
];

// Old school friends in all kinds of work: a group too wide for 一覧.
export const schoolFriends = (): Member[] => [
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

// A pattern as the group sees it: its standard time spelled out.
function memberPatternOf(own: Pattern): MemberPattern {
  return {
    id: own.id,
    look: own,
    name: own.name,
    off: own.countsAsOff,
    time: timeRange({ shift: own.id }, own),
  };
}

export function meFrom(
  schedule: Schedule,
  patterns: Pattern[],
  photo?: string,
  shownName?: string
): Member {
  const book = new Map(patterns.map((own) => [own.id, own]));
  return {
    changeOn: (date) => {
      const entry = schedule[dateKey(date)];
      const own = entry && book.get(entry.shift);
      const change = timeChangeOf(entry, own);
      return (
        change && entry && { ...change, time: timeRange(entry, own) ?? "" }
      );
    },
    id: "me",
    me: true,
    name: "自分",
    patterns: patterns.map(memberPatternOf),
    photo,
    shiftOn: (date) => schedule[dateKey(date)]?.shift,
    shownName,
  };
}

export function patternOn(member: Member, date: Date) {
  const id = member.shiftOn(date);
  return member.patterns.find((item) => item.id === id);
}

// Everyone has a pattern that counts as a day off. An unfilled day does
// not count, since nobody knows yet.
export function everyoneOff(members: Member[], date: Date) {
  return members.every((member) => patternOn(member, date)?.off === true);
}

// A day everyone may yet be off: no one who has entered it works, but
// someone has not entered it.
function mayAllBeOff(members: Member[], date: Date) {
  const items = members.map((member) => patternOn(member, date));
  return (
    items.includes(undefined) &&
    items.every((item) => item === undefined || item.off)
  );
}

// A month's days everyone is off, and whether days not entered yet may
// add to them, so that "none" is said only when it is known.
export type Together = { days: Date[]; unsure: boolean };

export function togetherIn(members: Member[], dates: Date[]): Together {
  return {
    days: dates.filter((date) => everyoneOff(members, date)),
    unsure: dates.some((date) => mayAllBeOff(members, date)),
  };
}

export function sameMonth(date: Date, month: Date) {
  return date.getMonth() === month.getMonth();
}

// A chat line. `days` shares dates, drawn with everyone's shifts;
// `photo` is a picture, one per line; `replyTo` quotes an earlier line;
// `text` keeps a mention as <@id> (spec/chat.md); `link` is the
// preview of the first link in `text`, made as it was
// written and sent with it; `notice` is a line from the app about who is
// in the group, how to get in or what it is called, shown between the
// messages.
export type Message = {
  id: string;
  from: string;
  when: string;
  time: string;
  // Changed by its writer after it was sent; the chat says 編集済み.
  edited?: boolean;
  // Taken back by its writer: only a line saying so stays, for everyone.
  unsent?: boolean;
  // Pinned over the chat, for everyone; the larger, the later it was.
  pinned?: number;
  // Days put to the vote, in place of `days` shared as they are.
  poll?: Poll;
  text?: string;
  link?: LinkPreview;
  notice?: string;
  days?: Date[];
  photo?: Photo;
  replyTo?: string;
  reactions?: Reaction[];
};

export type Reaction = { emoji: string; by: string[] };

// Days put to the vote: who can come on each (member ids, by dateKey), and
// the day its writer settled on, which ends the voting.
export type Poll = {
  days: Date[];
  votes: Record<string, string[]>;
  decided?: string;
};

// A link's page as its preview shows it: its title, the site's name and
// its picture, read from the page by the server (spec/chat.md).
export type LinkPreview = {
  url: string;
  title: string;
  site: string;
  image?: string;
};

// A page's picture for a sample link: an Unsplash photo from
// picsum.photos, at the 1.91:1 that pages give for previews.
function samplePagePicture(id: number) {
  return `https://picsum.photos/id/${id}/600/314`;
}

const cafePreview: LinkPreview = {
  image: samplePagePicture(431),
  site: "cafe-komorebi.example",
  title: "cafe こもれび｜季節のケーキと自家焙煎コーヒー",
  url: "https://cafe-komorebi.example/menu",
};

// The pages the sample links lead to. They are made up, on names kept
// for examples, so /design shows no real shop.
const samplePreviews: LinkPreview[] = [
  cafePreview,
  {
    image: samplePagePicture(292),
    site: "maruyama-yakiniku.example",
    title: "焼肉まるやま 駅前店｜ネット予約",
    url: "https://maruyama-yakiniku.example/",
  },
];

// The preview for a link, as the server would read it: a sample page, or
// for any other link a page that gives no title or picture, which shows
// its address in place of a title.
export function previewOf(url: string): LinkPreview {
  return (
    samplePreviews.find((sample) => sample.url === url) ?? {
      site: siteOf(url),
      title: url.replace(/^https?:\/\//iu, ""),
      url,
    }
  );
}

export type Chat = { messages: Message[]; unread: number };

export const groupChat = "group";

export const reactionChoices = ["👍", "❤️", "😂", "👀", "🙏", "🎉"];

export const sampleChats: Record<string, Chat> = {
  "family:group": {
    messages: [
      // An invitation whose link was remade since, so it no longer works.
      {
        from: "yuki",
        id: "f0",
        text: "いとこ会のグループ作ったよ！\nhttps://pochical.app/invite/Toko2ab9",
        time: "18:40",
        when: "昨日",
      },
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
      {
        from: "yuki",
        id: "f8",
        photo: sampleRosterPhoto(),
        time: "10:20",
        when: "今日",
      },
      {
        from: "yuki",
        id: "f9",
        text: "10月の勤務表出た！マーカーのとこが私",
        time: "10:20",
        when: "今日",
      },
      {
        from: "yuki",
        id: "f10",
        text: "いとこ会のリンク作り直したから、こっちから入って〜\nhttps://pochical.app/invite/Toko2345",
        time: "10:24",
        when: "今日",
      },
    ],
    unread: 4,
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
        // First 22日, then changed: 21日 is the day everyone is off.
        edited: true,
        // What was decided, kept over the chat.
        pinned: 1,
        replyTo: "n3",
        text: "21日にしよ！",
        time: "12:24",
        when: "今日",
      },
      {
        from: "aya",
        id: "n5",
        link: cafePreview,
        text: `ここ気になってた！\n${cafePreview.url}`,
        time: "12:31",
        when: "今日",
      },
    ],
    unread: 4,
  },
  // Nine in all, so shared days have to fit more people than a bubble
  // holds across.
  "school:group": {
    messages: [
      {
        from: "sakiko",
        id: "s0",
        notice: "さきこがグループに参加しました",
        time: "20:02",
        when: "昨日",
      },
      {
        from: "kana",
        id: "s1",
        text: "10月に一回集まりたいね！",
        time: "20:14",
        when: "昨日",
      },
      {
        days: [new Date(2026, 9, 3)],
        from: "kana",
        id: "s2",
        time: "20:15",
        when: "昨日",
      },
      {
        days: [
          new Date(2026, 9, 10),
          new Date(2026, 9, 11),
          new Date(2026, 9, 12),
        ],
        from: "me",
        id: "s3",
        time: "21:02",
        when: "昨日",
      },
      {
        days: [
          new Date(2026, 9, 18),
          new Date(2026, 9, 24),
          new Date(2026, 9, 25),
          new Date(2026, 9, 31),
          new Date(2026, 10, 1),
          new Date(2026, 10, 7),
          new Date(2026, 10, 8),
          new Date(2026, 10, 14),
        ],
        from: "riku",
        id: "s4",
        time: "8:40",
        when: "今日",
      },
      {
        from: "kana",
        id: "s5",
        replyTo: "s3",
        text: "<@me> 11日ならみんな来れそう！その日でいい？",
        time: "9:15",
        when: "今日",
      },
    ],
    unread: 2,
  },
  // Six in all, so reactions run from one face to a count. けんた, who
  // moved to another ward, has left it.
  "ward:group": {
    messages: [
      {
        from: "kenta",
        id: "w0",
        notice: "けんたがグループを抜けました",
        time: "17:12",
        when: "昨日",
      },
      {
        from: "haruka",
        id: "w1",
        reactions: [{ by: ["ren", "mei", "sota", "yui"], emoji: "👀" }],
        text: "来月の勤務表出たね！",
        time: "17:30",
        when: "昨日",
      },
      {
        from: "ren",
        id: "w2",
        reactions: [{ by: ["haruka"], emoji: "🥲" }],
        text: "12日の夜勤、誰か代わってくれる人いないかな…",
        time: "17:42",
        when: "昨日",
      },
      {
        from: "ren",
        id: "w2u",
        time: "17:43",
        unsent: true,
        when: "昨日",
      },
      {
        from: "me",
        id: "w3",
        reactions: [
          { by: ["ren"], emoji: "❤️" },
          { by: ["haruka", "yui", "mei"], emoji: "🙏" },
        ],
        replyTo: "w2",
        text: "わたし代われるよ！",
        time: "18:05",
        when: "昨日",
      },
      {
        from: "sota",
        id: "w4",
        reactions: [
          { by: ["haruka", "ren", "mei", "yui", "me"], emoji: "🎉" },
          { by: ["ren", "mei"], emoji: "🍻" },
        ],
        text: "久しぶりに同期会しよう！",
        time: "12:10",
        when: "今日",
      },
      {
        from: "sota",
        id: "w5",
        poll: {
          days: [
            new Date(2026, 9, 16),
            new Date(2026, 9, 17),
            new Date(2026, 9, 23),
          ],
          votes: {
            "2026-10-16": ["sota", "haruka", "ren"],
            "2026-10-17": ["sota", "mei"],
            "2026-10-23": ["haruka", "yui"],
          },
        },
        time: "12:12",
        when: "今日",
      },
    ],
    unread: 2,
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

// A group chat with a line from the app added, when who is in the group,
// how to get in or what it is called changes: someone joining, leaving or
// taken out, a new invite link, or a new name or icon. Nothing else, so
// the lines stay worth reading.
export function withNotice(
  chats: Record<string, Chat>,
  groupId: string,
  notice: string
): Record<string, Chat> {
  const key = chatKey(groupId, groupChat);
  const chat = chats[key] ?? { messages: [], unread: 0 };
  const now = new Date();
  const line: Message = {
    from: "me",
    id: `notice-${chat.messages.length}`,
    notice,
    time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`,
    when: "今日",
  };
  return { ...chats, [key]: { ...chat, messages: [...chat.messages, line] } };
}

export function chatTitle(group: Group, chatId: string) {
  if (chatId === groupChat) {
    return "全体チャット";
  }
  return group.members.find((member) => member.id === chatId)?.name ?? "";
}

// The sample groups' other members, by group id: the four the sample
// person is in and the cousins' group of the sample invitation. A group
// made on /design starts with no one else.
export function sampleOthers(groupId: string): Member[] {
  switch (groupId) {
    case "family": {
      return [partner, mother];
    }
    case "friends": {
      return [misaki(), aya()];
    }
    case "ward": {
      return classmates();
    }
    case "school": {
      return schoolFriends();
    }
    case "cousins": {
      return cousins();
    }
    default: {
      return [];
    }
  }
}

export function isMuted(group: Pick<Group, "mutedChats">, chatId: string) {
  return group.mutedChats?.includes(chatId) ?? false;
}

// The group with one of its chats turned off or back on.
export function withMuted<G extends Pick<Group, "mutedChats">>(
  group: G,
  chatId: string,
  muted: boolean
): G {
  const rest = (group.mutedChats ?? []).filter((id) => id !== chatId);
  return { ...group, mutedChats: muted ? [...rest, chatId] : rest };
}

export function chatKey(groupId: string, chatId: string) {
  return `${groupId}:${chatId}`;
}

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
      // Nine of them and lively, so its group chat is turned off; a line
      // that mentions her still comes through.
      mutedChats: [groupChat],
      name: "高校の同級生",
    },
  ];
}

function presetLook(id: string) {
  return sampleLooks[id as keyof typeof sampleLooks] ?? sampleLooks.natural;
}

// A group's face: one choice made by whoever set it up, the same for every
// member whatever their style, like a group picture in a chat app.
export type GroupMark =
  | { kind: "emoji"; emoji: string }
  | { kind: "icon"; icon: MarkIcon; color: number }
  | { kind: "letter"; text: string; color: number }
  | { kind: "photo"; photo: string };

export type GroupMarkKind = GroupMark["kind"];
