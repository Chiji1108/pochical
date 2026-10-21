import type { GroupLook, Look, MarkIcon } from "../components/shift-mark";
import { mentionsOf } from "./chat-text";
import { dateKey, timeChangeOf, timeRange } from "./design-days";
import type { Schedule } from "./design-days";
import type { Pattern } from "./design-patterns";
import type { Photo } from "./design-sample-photos";
import { allOff, mayAllBeOff } from "./together";

// The group screens' data: members, groups and chats as the prototype
// keeps them, and what is worked out from them (who is off when, days
// everyone is off, what is unread). The sample people, groups and chats
// are in design-group-samples.

// A pattern as another member set it up. Their looks come with them, and
// each viewer sees them in their own style.
export type MemberPattern = {
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
  style?: GroupLook;
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

export type Profile = { name: string; photo?: string };

// A pattern as the group sees it: its standard time spelled out.
export function memberPatternOf(own: Pattern): MemberPattern {
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

// Whether each member is off on the day, undefined where they have not
// entered it.
function offsOn(members: Member[], date: Date) {
  return members.map((member) => patternOn(member, date)?.off);
}

// Everyone has a pattern that counts as a day off. An unfilled day does
// not count, since nobody knows yet.
export function everyoneOff(members: Member[], date: Date) {
  return allOff(offsOn(members, date));
}

// A month's days everyone is off, and whether days not entered yet may
// add to them, so that "none" is said only when it is known.
export type Together = { days: Date[]; unsure: boolean };

export function togetherIn(members: Member[], dates: Date[]): Together {
  return {
    days: dates.filter((date) => everyoneOff(members, date)),
    unsure: dates.some((date) => mayAllBeOff(offsOn(members, date))),
  };
}

export function sameMonth(date: Date, month: Date) {
  return date.getMonth() === month.getMonth();
}

// A chat line. `days` shares dates, drawn with everyone's shifts;
// `photos` are pictures sent at once, in the order sent; `replyTo` quotes
// an earlier line;
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
  // 1 to chatRules.photosPerSend; two or more are drawn as an album
  // (spec/chat.md, Albums).
  photos?: Photo[];
  replyTo?: string;
  reactions?: Reaction[];
  // Yours, not sent (a photo could not be uploaded): only this phone
  // knows, as the apps keep it in their outbox (spec/chat.md, Lines on
  // their way).
  failed?: boolean;
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

// What was being written in a chat, kept as it was left (spec/chat.md,
// Drafts): its words as they would be sent, mentions as <@id>, and the
// line it answers or changes.
export type ChatDraft = { text: string; replyTo?: string; editing?: string };

export type Chat = { messages: Message[]; unread: number; draft?: ChatDraft };

export const groupChat = "group";

export const reactionChoices = ["👍", "❤️", "😂", "👀", "🙏", "🎉"];

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

// The unread lines that notify (spec/chat.md, Unread lines): all of a chat's
// while it is on; in a chat turned off, only those that mention the
// reader, and those only while メンションはいつも通知 is on.
function notifyingUnread(
  chat: Chat,
  muted: boolean,
  mentionsWhenMuted: boolean
) {
  if (!muted) {
    return chat.unread;
  }
  return mentionsWhenMuted ? unreadMentions(chat) : 0;
}

// How many of a chat's unread lines mention the reader.
export function unreadMentions(chat: Chat) {
  if (chat.unread === 0) {
    return 0;
  }
  return chat.messages
    .slice(-chat.unread)
    .filter((message) => mentionsOf(message.text ?? "").includes("me")).length;
}

// What notifies unread in one group's chats, for its icon in the list of
// groups.
export function groupUnread(
  chats: Record<string, Chat>,
  group: Pick<Group, "id" | "mutedChats">,
  mentionsWhenMuted: boolean
) {
  const prefix = chatKey(group.id, "");
  let total = 0;
  for (const [key, chat] of Object.entries(chats)) {
    if (key.startsWith(prefix)) {
      const muted = isMuted(group, key.slice(prefix.length));
      total += notifyingUnread(chat, muted, mentionsWhenMuted);
    }
  }
  return total;
}

// What notifies unread in all the groups one is in, for the グループ tab.
export function groupsUnread(
  chats: Record<string, Chat>,
  groups: Pick<Group, "id" | "mutedChats">[],
  mentionsWhenMuted: boolean
) {
  let total = 0;
  for (const group of groups) {
    total += groupUnread(chats, group, mentionsWhenMuted);
  }
  return total;
}

// A group as the list keeps it, without its members' shifts.
export type GroupSummary = Omit<Group, "members">;

// A group's face: one choice made by whoever set it up, the same for every
// member whatever their style, like a group picture in a chat app.
export type GroupMark =
  | { kind: "emoji"; emoji: string }
  | { kind: "icon"; icon: MarkIcon; color: number }
  | { kind: "letter"; text: string; color: number }
  | { kind: "photo"; photo: string };

export type GroupMarkKind = GroupMark["kind"];
