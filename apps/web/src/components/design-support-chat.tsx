import { Image as ImageIcon, SendHorizontal, X } from "lucide-react";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { css } from "styled-system/css";

import { APP_VERSION, deviceNames, useDevice } from "../lib/design-device";
import type { Photo } from "../lib/design-sample-photos";
import { useSettings } from "../lib/design-settings-store";
import { site } from "../lib/site";
import { AppIcon, useAppIcons } from "./design-app-icon";
import {
  chatAvatarSize,
  chatStyle,
  maxPhotos,
  photoOf,
  photoSize,
} from "./design-group-chat";
import { PhotoViewer } from "./design-sheet";
import { ToastContext } from "./design-toast";
import { BackButton, LimitedTextArea, Screen, srOnly } from "./design-ui";

// お問い合わせ as a chat with the people who make Pochical, rather than a
// mail: a small complaint or wish is easier to write in a chat, and the
// answer comes back in the same place. It looks like the group chats, so
// it is already familiar, and keeps to what writing to support needs:
// words and photos (a screenshot of what went wrong), no reactions,
// replies, days or polls. Its head says plainly who reads it and what
// reaches them, since only this chat is read by Pochical's people.

export type SupportSample = "none" | "answered";

export type SupportLine = {
  id: string;
  // You, or Pochical's people.
  from: "me" | "support";
  text?: string;
  photo?: Photo;
  when: string;
  time: string;
};

const answeredLines: SupportLine[] = [
  {
    from: "me",
    id: "s1",
    text: "夜勤と準夜の色が似ていて、月の表だと見分けにくいです。もう少し違う色にできたらうれしいです！",
    time: "22:41",
    when: "9月28日(月)",
  },
  {
    from: "support",
    id: "s2",
    text: "ご連絡ありがとうございます！並べると、たしかに似て見えますね。色の組み合わせを見直してみます。変えたら、ここでお知らせします。",
    time: "11:05",
    when: "9月30日(水)",
  },
];

export function supportLinesOf(sample: SupportSample): SupportLine[] {
  return sample === "answered" ? answeredLines : [];
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
  // The one tool, the photo button, sits where the group chats' tools do.
  tools: css({ display: "flex", flexShrink: 0 }),
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

function SupportPhoto({ photo, mine }: { photo: Photo; mine: boolean }) {
  const [viewing, setViewing] = useState(false);
  const size = photoSize(photo);
  const label = mine ? "送った写真" : `${site.name}から届いた写真`;
  return (
    <>
      <span
        className={chatStyle.photo}
        data-part="bubble"
        style={{ width: size.width }}
      >
        <button
          aria-label={`${label}。押すと大きく表示`}
          className={chatStyle.photoButton}
          onClick={() => {
            setViewing(true);
          }}
          type="button"
        >
          <img
            alt=""
            className={chatStyle.photoImage({ quoted: false })}
            draggable={false}
            height={size.height}
            src={photo.src}
            width={size.width}
          />
        </button>
      </span>
      <PhotoViewer
        label={label}
        onOpenChange={setViewing}
        open={viewing}
        photo={photo.src}
        whole
      />
    </>
  );
}

export function SupportChatPage({
  lines,
  onChange,
  onBack,
}: {
  lines: SupportLine[];
  onChange: (lines: SupportLine[]) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  // Photos chosen to go with the next send, held above the composer as
  // in the group chats: nothing is sent on choosing.
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [reading, setReading] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const toast = useContext(ToastContext);
  const icons = useAppIcons();
  const icon = icons[useSettings((state) => state.device.appIcon)];
  // Opens on the latest line and follows each one sent; with none yet,
  // the intro stays in sight from its top.
  const latest = lines.at(-1)?.id;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && latest !== undefined) {
      list.scrollTop = list.scrollHeight;
    }
  }, [latest]);
  const choosePhotos = async (files: File[]) => {
    const room = maxPhotos - photos.length;
    if (files.length > room) {
      toast(`写真は一度に${maxPhotos}枚まで送れます`, "problem");
    }
    const taken = files.slice(0, room);
    setReading((count) => count + taken.length);
    const results = await Promise.allSettled(taken.map(photoOf));
    setReading((count) => count - taken.length);
    const chosen = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    setPhotos((before) => [...before, ...chosen].slice(0, maxPhotos));
    if (chosen.length < taken.length) {
      toast("開けない写真がありました", "problem");
    }
  };
  const text = draft.trim();
  const canSend = reading === 0 && (text !== "" || photos.length > 0);
  // Each photo is a line of its own, then what was written.
  const send = () => {
    if (!canSend) {
      return;
    }
    const sent: SupportLine[] = [
      ...photos.map((photo) => ({ photo })),
      ...(text ? [{ text }] : []),
    ].map((line, index) => ({
      ...line,
      from: "me",
      id: `sent-${lines.length + index}`,
      time: "10:10",
      when: "今日",
    }));
    onChange([...lines, ...sent]);
    setDraft("");
    setPhotos([]);
  };
  return (
    <Screen>
      <header className={chatStyle.header}>
        <BackButton onClick={onBack}>設定</BackButton>
        <h3 className={chatStyle.title}>お問い合わせ</h3>
      </header>
      <div className={chatStyle.lines}>
        <ol
          aria-label="お問い合わせのメッセージ"
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
              <li className={chatStyle.item()} key={line.id}>
                {previous?.when !== line.when && (
                  <span className={chatStyle.when}>{line.when}</span>
                )}
                <span className={chatStyle.message({ mine })}>
                  {!mine && (
                    <span className={chatStyle.avatar}>
                      {firstOfRun && (
                        <AppIcon size={chatAvatarSize} src={icon} />
                      )}
                    </span>
                  )}
                  <span className={chatStyle.body({ mine })}>
                    {!mine && firstOfRun && (
                      <small className={chatStyle.name}>{site.name}</small>
                    )}
                    <span className={chatStyle.bubbleRow({ mine })}>
                      {line.photo ? (
                        <SupportPhoto mine={mine} photo={line.photo} />
                      ) : (
                        <span
                          className={chatStyle.bubble({ mine })}
                          data-part="bubble"
                        >
                          <span className={chatStyle.bubbleText}>
                            {line.text}
                          </span>
                        </span>
                      )}
                      <small className={chatStyle.time}>{line.time}</small>
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {photos.length > 0 && (
        <ul aria-label="送る写真" className={chatStyle.tray({ below: false })}>
          {photos.map((photo, index) => (
            <li className={chatStyle.trayItem} key={photo.src}>
              <img alt="" className={chatStyle.trayImage} src={photo.src} />
              <button
                aria-label={`${index + 1}枚目の写真を外す`}
                className={chatStyle.trayRemove}
                onClick={() => {
                  setPhotos((before) =>
                    before.filter((other) => other !== photo)
                  );
                }}
                type="button"
              >
                <X aria-hidden="true" size={12} strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={chatStyle.composer({ replying: photos.length > 0 })}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          accept="image/*"
          className={srOnly}
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            choosePhotos(files).catch(() => undefined);
          }}
          ref={photoInputRef}
          tabIndex={-1}
          type="file"
        />
        <span className={support.tools}>
          <button
            aria-label="写真を送る"
            className={chatStyle.composerButton({ tool: true })}
            onClick={() => {
              photoInputRef.current?.click();
            }}
            type="button"
          >
            <ImageIcon aria-hidden="true" size={20} />
          </button>
        </span>
        <LimitedTextArea
          aria-label="メッセージ"
          className={chatStyle.composerInput}
          kind="chatMessage"
          onValueChange={setDraft}
          placeholder="メッセージ"
          value={draft}
        />
        <button
          aria-label="送る"
          className={chatStyle.composerButton({ send: true })}
          disabled={!canSend}
          type="submit"
        >
          <SendHorizontal aria-hidden="true" size={18} />
        </button>
      </form>
    </Screen>
  );
}
