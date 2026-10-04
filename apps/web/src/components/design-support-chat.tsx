import { useEffect, useLayoutEffect, useRef } from "react";
import { css } from "styled-system/css";

import { APP_VERSION, deviceNames, useDevice } from "../lib/design-device";
import { useSettings } from "../lib/design-settings-store";
import type { SupportLine } from "../lib/design-support";
import { useUser } from "../lib/design-user-store";
import { site } from "../lib/site";
import { AppIcon, useAppIcons } from "./design-app-icon";
import { PhotoLine } from "./design-chat-cards";
import { Composer, useComposer } from "./design-chat-composer";
import { ChatListRow, LineFrame } from "./design-chat-parts";
import { chatAvatarSize, chatStyle } from "./design-chat-style";
import { BackButton } from "./design-header";
import { List } from "./design-list";
import { Screen } from "./design-ui";

// Writing to support as a chat with the people who make Pochical, rather
// than a mail: a small complaint or wish is easier to write in a chat,
// and the answer comes back in the same place. It looks like the group
// chats, so it is already familiar, and keeps to what writing to support
// needs: words and photos (a screenshot of what went wrong), no
// reactions, replies, days or polls. Its head says plainly who reads it
// and what reaches them, since only this chat is read by Pochical's
// people.

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
  const last = lines.at(-1);
  let preview = "ほしい機能や不具合のこと、気軽にどうぞ";
  if (last) {
    preview = last.photo ? "写真" : (last.text ?? "");
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

export function SupportChatPage({ onBack }: { onBack: () => void }) {
  const lines = useUser((state) => state.support.lines);
  const setSupport = useUser((state) => state.setSupport);
  // Answers on screen are read: those waiting as it opens, and those that
  // come while it is open.
  const unread = useUser((state) => state.support.unread);
  useEffect(() => {
    if (unread > 0) {
      setSupport((before) => ({ ...before, unread: 0 }));
    }
  }, [unread, setSupport]);
  // Words and photos, as in the group chats, without what only they
  // have: no one to mention, no link's page read.
  const composer = useComposer({ linkPreviews: false });
  const listRef = useRef<HTMLOListElement>(null);
  const icon = useOwnIcon();
  // Opens on the latest line and follows each one sent; with none yet,
  // the intro stays in sight from its top.
  const latest = lines.at(-1)?.id;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && latest !== undefined) {
      list.scrollTop = list.scrollHeight;
    }
  }, [latest]);
  // Each photo is a line of its own, then what was written.
  const send = () => {
    if (!composer.sendable) {
      return;
    }
    const text = composer.draft.trim();
    const sent: SupportLine[] = [
      ...composer.photos.map((photo) => ({ photo })),
      ...(text ? [{ text }] : []),
    ].map((line, index) => ({
      ...line,
      from: "me",
      id: `sent-${lines.length + index}`,
      time: "10:10",
      when: "今日",
    }));
    setSupport((before) => ({ ...before, lines: [...before.lines, ...sent] }));
    composer.clear();
  };
  return (
    <Screen>
      <header className={chatStyle.header}>
        <BackButton onClick={onBack}>設定</BackButton>
        {/* Named for who is on the other side, as a chat is. */}
        <h3 className={chatStyle.title}>{site.name}</h3>
      </header>
      <div className={chatStyle.lines}>
        <ol
          aria-label={`${site.name}とのメッセージ`}
          className={chatStyle.messages}
          ref={listRef}
        >
          <Intro icon={icon} />
          {lines.map((line, index) => {
            const mine = line.from === "me";
            const previous = lines[index - 1];
            const firstOfRun =
              previous?.from !== line.from || previous.when !== line.when;
            return (
              <LineFrame
                avatar={
                  firstOfRun && <AppIcon size={chatAvatarSize} src={icon} />
                }
                day={previous?.when === line.when ? undefined : line.when}
                key={line.id}
                mine={mine}
                name={firstOfRun ? site.name : undefined}
              >
                <span className={chatStyle.bubbleRow({ mine })}>
                  {line.photo ? (
                    <PhotoLine
                      label={mine ? "送った写真" : `${site.name}から届いた写真`}
                      mine={mine}
                      photo={line.photo}
                    />
                  ) : (
                    <span
                      className={chatStyle.bubble({ mine })}
                      data-part="bubble"
                    >
                      <span className={chatStyle.bubbleText}>{line.text}</span>
                    </span>
                  )}
                  <small className={chatStyle.time}>{line.time}</small>
                </span>
              </LineFrame>
            );
          })}
        </ol>
      </div>
      <Composer composer={composer} onSend={send} />
    </Screen>
  );
}
