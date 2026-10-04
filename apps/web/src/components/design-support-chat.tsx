import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { css } from "styled-system/css";

import { APP_VERSION, deviceNames, useDevice } from "../lib/design-device";
import { useSettings } from "../lib/design-settings-store";
import { useUser } from "../lib/design-user-store";
import { site } from "../lib/site";
import { AppIcon, useAppIcons } from "./design-app-icon";
import { LinkMenu, openLink } from "./design-chat-actions";
import type { LinkMenuAt } from "./design-chat-actions";
import { Composer, useComposer } from "./design-chat-composer";
import { useChatEdits } from "./design-chat-edits";
import { ChatContext, MessageLine } from "./design-chat-line";
import type { ChatScope } from "./design-chat-line";
import { ChatListRow } from "./design-chat-parts";
import { chatAvatarSize, chatStyle } from "./design-chat-style";
import { summaryOf, unsentLine } from "./design-chat-summary";
import { EmojiPickerSheet } from "./design-emoji-picker";
import type { Member, Profile } from "./design-group-data";
import { BackButton } from "./design-header";
import { List } from "./design-list";
import { ConfirmDialog } from "./design-sheet";
import { Screen } from "./design-ui";

// Writing to support as a chat with the people who make Pochical, rather
// than a mail: a small complaint or wish is easier to write in a chat,
// and the answer comes back in the same place. It is drawn and pressed as
// the group chats are, with their lines and their long press, so it is
// already familiar: words, links and their pages, and photos (a
// screenshot of what went wrong); reactions, so a 👍 can answer and a 👀
// say it was read; 返信, for a thread that holds more than one matter;
// コピー; and 送信取消, for a screenshot sent with more in it than meant.
// Not what only a group needs: no days, polls, mentions, pins or reports,
// and no 編集, as an answer may already be written to the words. Its head
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
  const { lines, unread } = useUser((state) => state.support);
  const profile = useUser((state) => state.profile);
  const last = lines.at(-1);
  let preview = "ほしい機能や不具合のこと、気軽にどうぞ";
  if (last?.unsent) {
    preview = unsentLine(
      membersOf(profile, icon).find((member) => member.id === last.from)
    );
  } else if (last) {
    preview = summaryOf(last, nameless);
  }
  return (
    <List>
      <ChatListRow
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
        届くのは、ここに書いたことと写真、それにアプリと端末の情報だけです。
        <br />
        {site.name} {APP_VERSION}・{deviceNames[platform]}
      </p>
    </li>
  );
}

// No one is mentioned here.
const nameless = () => "";

export function SupportChatPage({ onBack }: { onBack: () => void }) {
  const lines = useUser((state) => state.support.lines);
  const setSupport = useUser((state) => state.setSupport);
  const profile = useUser((state) => state.profile);
  // Answers on screen are read: those waiting as it opens, and those that
  // come while it is open.
  const unread = useUser((state) => state.support.unread);
  useEffect(() => {
    if (unread > 0) {
      setSupport((before) => ({ ...before, unread: 0 }));
    }
  }, [unread, setSupport]);
  // Words, links and photos, as in the group chats, with no one to
  // mention and no days to share.
  const composer = useComposer({});
  const listRef = useRef<HTMLOListElement>(null);
  const icon = useOwnIcon();
  // A link long pressed in a line: its own small menu, as in the chats.
  const [linkMenu, setLinkMenu] = useState<LinkMenuAt>();
  const members = membersOf(profile, icon);
  const {
    actionsOf,
    byId,
    flash,
    jumpTo,
    pickingFor,
    react,
    replyTo,
    selected,
    send,
    setPickingFor,
    setReplyTo,
    setSelected,
    setUnsending,
    unsend,
    unsending,
  } = useChatEdits({
    composer,
    mentionName: nameless,
    messages: lines,
    onChange: (next) => {
      setSupport((before) => ({ ...before, lines: next }));
    },
    onSent: () => undefined,
  });
  const replying = byId(replyTo);
  const writerOf = (id?: string) => members.find((member) => member.id === id);
  const scope: ChatScope = {
    faces: { support: <AppIcon size={chatAvatarSize} src={icon} /> },
    isGroup: false,
    members,
    mentionName: nameless,
    onJump: jumpTo,
    onLinkMenu: setLinkMenu,
    // No days are shared here.
    onOpenDay: () => undefined,
    people: members,
    writerOf,
  };
  // Opens on the latest line and follows each one sent; with none yet,
  // the intro stays in sight from its top.
  const latest = lines.at(-1)?.id;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && latest !== undefined) {
      list.scrollTop = list.scrollHeight;
    }
  }, [latest]);
  return (
    <Screen>
      <header className={chatStyle.header}>
        <BackButton onClick={onBack}>設定</BackButton>
        {/* Named for who is on the other side, as a chat is. */}
        <h3 className={chatStyle.title}>{site.name}</h3>
      </header>
      <div className={chatStyle.lines}>
        <ChatContext value={scope}>
          <ol
            aria-label={`${site.name}とのメッセージ`}
            className={chatStyle.messages}
            ref={listRef}
          >
            <Intro icon={icon} />
            {lines.map((line, index) => (
              <MessageLine
                // What the group chats offer that this one leaves out.
                actions={{
                  ...actionsOf(line),
                  onEdit: undefined,
                  onPin: undefined,
                  onReport: undefined,
                }}
                flash={flash === line.id}
                hidden={false}
                key={line.id}
                lifted={selected === line.id}
                message={line}
                onSelect={() => {
                  setSelected(line.id);
                }}
                previous={lines[index - 1]}
                quoted={byId(line.replyTo)}
              />
            ))}
          </ol>
        </ChatContext>
      </div>
      <Composer
        composer={composer}
        onSend={send}
        reply={
          replying && {
            message: replying,
            onStop: () => {
              setReplyTo(undefined);
            },
            writer: writerOf(replying.from)?.name ?? "",
          }
        }
      />
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
      <LinkMenu
        at={linkMenu}
        onClose={() => {
          setLinkMenu(undefined);
        }}
        onOpen={openLink}
      />
      {unsending !== undefined && (
        <ConfirmDialog
          action="取り消す"
          message={`${site.name}を作っている人のチャットからも消えます。`}
          onCancel={() => {
            setUnsending(undefined);
          }}
          onConfirm={() => {
            unsend(unsending);
          }}
          title="送信を取り消しますか？"
        />
      )}
    </Screen>
  );
}
