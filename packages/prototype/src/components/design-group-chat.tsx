import { chatPlaces } from "@pochical/design/chat";
import type { ReactNode } from "react";

import { keptDraft } from "../lib/chat-messages";
import { plainText } from "../lib/chat-text";
import { unreadMentions } from "../lib/design-group-data";
import type { Chat, Group, Member } from "../lib/design-group-data";
import { useUser } from "../lib/design-user-store";
import { noOne } from "./design-chat-composer";
import { ChatListRow } from "./design-chat-parts";
import { ChatScreen } from "./design-chat-screen";
import type { ChatScreenProps } from "./design-chat-screen";
import { lastLineOf } from "./design-chat-summary";
import { profileIn } from "./design-group-settings";

// A group's chats: its 全体チャット and one-to-one chats, each a
// ChatScreen with everything a group's place takes, and their rows in the
// group's list of chats.

// A member's name by id, for a mention: @ and their name in the group,
// yours too (the others see it), not 自分.
const nameIn = (members: Member[], yours: string) => (id: string) => {
  const member = members.find((other) => other.id === id);
  return member?.me ? yours : (member?.name ?? "メンバー");
};

// Your name in the group, as the others read it.
function useYourName(group: Omit<Group, "members">) {
  return profileIn(
    group,
    useUser((state) => state.profile)
  ).name;
}

export function ChatRow({
  label,
  icon,
  chat,
  group,
  onOpen,
  muted = false,
}: {
  label: string;
  icon: ReactNode;
  chat: Chat;
  group: Group;
  onOpen: () => void;
  muted?: boolean;
}) {
  const yours = useYourName(group);
  const blocked = useUser((state) => state.blocked);
  const last = chat.messages.at(-1);
  // What was being written, as the chat's lines are now (spec/chat.md,
  // Drafts).
  const draft = chat.draft && keptDraft(chat.draft, chat.messages);
  return (
    <ChatListRow
      draft={draft && plainText(draft.text, nameIn(group.members, yours))}
      icon={icon}
      label={label}
      mentioned={unreadMentions(chat) > 0}
      muted={muted}
      onOpen={onOpen}
      preview={
        last
          ? lastLineOf(
              last,
              group.members.find((member) => member.id === last.from),
              nameIn(group.members, yours),
              blocked.includes(last.from)
            )
          : "まだメッセージはありません"
      }
      time={last?.time}
      unread={chat.unread}
    />
  );
}

// A chat in a group: who is in it and their names come from the group,
// and everything its place takes is offered.
export function GroupChatPage({
  group,
  formerMembers = noOne,
  ...chat
}: Omit<ChatScreenProps, "members" | "mentionName" | "rules" | "unsendNote"> & {
  group: Group;
}) {
  const mentionName = nameIn(
    [...group.members, ...formerMembers],
    useYourName(group)
  );
  return (
    <ChatScreen
      {...chat}
      formerMembers={formerMembers}
      members={group.members}
      mentionName={mentionName}
      rules={chatPlaces.group}
      unsendNote="メンバー全員のチャットから消えます。"
      writesBack
    />
  );
}
