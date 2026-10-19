import { chatPlaces } from "@pochical/design/chat";
import { useEffect, useState } from "react";
import { css } from "styled-system/css";

import { keptDraft } from "../lib/chat-messages";
import { APP_VERSION, deviceNames, useDevice } from "../lib/design-device";
import { useSettings } from "../lib/design-settings-store";
import { useUser } from "../lib/design-user-store";
import { site } from "../lib/site";
import { AppIcon, useAppIcons } from "./design-app-icon";
import { nameless } from "./design-chat-composer";
import { ChatListRow } from "./design-chat-parts";
import { ChatScreen } from "./design-chat-screen";
import { chatAvatarSize } from "./design-chat-style";
import { lastLineOf } from "./design-chat-summary";
import type { ListedLine } from "./design-chat-summary";
import type { Member, Profile } from "./design-group-data";
import { List } from "./design-list";

// Writing to support as a chat with the people who make Pochical, rather
// than a mail: a small complaint or wish is easier to write in a chat,
// and the answer comes back in the same place. It is the group chats' own
// ChatScreen, so it is already familiar: words, links and their pages,
// and photos (a screenshot of what went wrong); reactions, so a 👍 can
// answer and a 👀 say it was read; 返信, for a thread that holds more
// than one matter; コピー; and 送信取消, for a screenshot sent with more
// in it than meant. Its place's rules (chatPlaces.support) leave out what
// only a group needs: no days, polls, mentions, pins or reports, and no
// 編集, as an answer may already be written to the words. Its head
// says plainly who reads it and what reaches them, since only this chat
// is read by Pochical's people.

const noShift = () => undefined;

// Who the chat is between: you, and Pochical's people, who answer under
// the app's name and its icon.
function membersOf(profile: Profile, icon?: string): Member[] {
  return [
    { ...profile, id: "me", me: true, patterns: [], shiftOn: noShift },
    {
      id: "support",
      name: site.name,
      patterns: [],
      photo: icon,
      shiftOn: noShift,
    },
  ];
}

// The home screen icon in use, which stands for Pochical's people here.
function useOwnIcon() {
  const icons = useAppIcons();
  return icons[useSettings((state) => state.device.appIcon)];
}

// The way into the chat from the settings, drawn as a chat in the group
// chats' list is: the icon, who it is with and, once there are any, the
// latest line and its time, and the count of answers not read yet, as a
// chat's unread. Among the rows that leave for the site it would read as
// one more link; standing on its own as a chat, it says that Pochical's
// people can be talked to.
export function SupportRow({ onOpen }: { onOpen: () => void }) {
  const icon = useOwnIcon();
  const { messages: lines, unread, draft } = useUser((state) => state.support);
  const profile = useUser((state) => state.profile);
  const last = lines.at(-1);
  // What was being written, as the lines are now (spec/chat.md, Drafts).
  const kept = draft && keptDraft(draft, lines);
  let preview: ListedLine = "ほしい機能や不具合のこと、気軽にどうぞ";
  if (last) {
    preview = lastLineOf(
      last,
      membersOf(profile, icon).find((member) => member.id === last.from),
      nameless,
      false
    );
  }
  return (
    <List>
      <ChatListRow
        draft={kept?.text}
        // The size of a face in the chats' list.
        icon={<AppIcon size={28} src={icon} />}
        label="作っている人とチャット"
        onOpen={onOpen}
        preview={preview}
        time={last?.time}
        unread={unread}
      />
    </List>
  );
}

const support = {
  // At the top of the lines: who this reaches, and everything that does.
  intro: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    margin: "16px auto 8px",
    maxWidth: "300px",
    textAlign: "center",
  }),
  introNote: css({
    color: "text.tertiary",
    lineHeight: 1.6,
    margin: 0,
    textStyle: "caption",
  }),
  introText: css({
    color: "text.secondary",
    lineHeight: 1.6,
    margin: 0,
    textStyle: "subheadline",
  }),
  introTitle: css({
    fontWeight: 600,
    margin: "4px 0 0",
    textStyle: "headline",
  }),
};

function Intro({ icon }: { icon?: string }) {
  const platform = useDevice((state) => state.platform);
  return (
    <li className={support.intro}>
      <AppIcon size={56} src={icon} />
      <h4 className={support.introTitle}>
        {site.name}を作っている人に届きます
      </h4>
      <p className={support.introText}>
        使いにくいところ、ほしい機能、不具合のこと。ちょっとしたことでも、気軽に書いてください。返事は数日のうちに、ここに届きます。
      </p>
      <p className={support.introNote}>
        書いたことと一緒に、アプリと端末の情報が届きます。
        <br />
        {site.name} {APP_VERSION}・{deviceNames[platform]}
      </p>
    </li>
  );
}

export function SupportChatPage({ onBack }: { onBack: () => void }) {
  const chat = useUser((state) => state.support);
  const setSupport = useUser((state) => state.setSupport);
  const profile = useUser((state) => state.profile);
  const icon = useOwnIcon();
  // Answers on screen are read: those waiting as it opens, under
  // ここから新着, and those that come while it is open.
  const [unreadAtOpen] = useState(chat.unread);
  useEffect(() => {
    if (chat.unread > 0) {
      setSupport((before) => ({ ...before, unread: 0 }));
    }
  }, [chat.unread, setSupport]);
  return (
    <ChatScreen
      backLabel="設定"
      chat={chat}
      faces={{ support: <AppIcon size={chatAvatarSize} src={icon} /> }}
      head={<Intro icon={icon} />}
      members={membersOf(profile, icon)}
      mentionName={nameless}
      onBack={onBack}
      onChange={(messages) => {
        setSupport((before) => ({ ...before, messages }));
      }}
      onDraft={(draft) => {
        setSupport((before) => ({ ...before, draft }));
      }}
      rules={chatPlaces.support}
      // Named for who is on the other side, as a chat is.
      title={site.name}
      unreadAtOpen={unreadAtOpen}
      unsendNote={`${site.name}を作っている人のチャットからも消えます。`}
    />
  );
}
