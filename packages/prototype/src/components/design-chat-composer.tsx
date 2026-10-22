import { Menu } from "@ark-ui/react";
import { chatRules } from "@pochical/design/chat";
import { cx } from "@pochical/styled-system/css";
import {
  ArrowUp,
  CalendarPlus,
  Check,
  ImageIcon,
  Plus,
  SendHorizontal,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import {
  answering,
  changing,
  emptyWriting,
  picking,
  sharing,
  stopping,
  writingOf,
} from "../lib/chat-messages";
import type { Writing } from "../lib/chat-messages";
import {
  firstLink,
  inviteCodeOf,
  mentionQuery,
  pickingMention,
  siteOf,
} from "../lib/chat-text";
import { useDevice } from "../lib/design-device";
import type {
  ChatDraft,
  LinkPreview,
  Member,
  Message,
} from "../lib/design-group-data";
import { previewOf } from "../lib/design-group-samples";
import { PhotoInput, PhotoTray, useChosenPhotos } from "./design-chat-photos";
import { chatStyle } from "./design-chat-style";
import { daysSummary, summaryOf } from "./design-chat-summary";
import { LimitedTextArea } from "./design-fields";
import { Avatar } from "./design-group-parts";
import { MenuItem, menuStyle } from "./design-menu";
import { floatingGlass, IconButton } from "./design-ui";

// Writing in a chat: what is being written (useComposer), the page of a
// link as it is written, and the composer floating at the chat's foot.

// A chat with no one to mention, as the support chat.
export const noOne: Member[] = [];

export const nameless = () => "";

// What is being written, as one Writing: the words, the members picked
// from the @ list, days brought from the shift table, photos chosen, the
// link whose page × took off, and the line it answers or your line whose
// words it changes; and the page of its first link.
export function useComposer({
  attach,
  kept,
  members = noOne,
  mentionName = nameless,
}: {
  attach?: Date[];
  // The draft the chat was left with (spec/chat.md, Drafts).
  kept?: ChatDraft;
  // Who an @ lists: the others in the group chat, none in a one-to-one
  // or the support chat.
  members?: Member[];
  // A mention's name, for words put back to be changed.
  mentionName?: (id: string) => string;
}) {
  const [writing, setWriting] = useState<Writing>(() => {
    const opened = writingOf(kept?.text ?? "", mentionName, kept?.target);
    return attach ? sharing(opened, attach) : opened;
  });
  const { words: draft, picked, target, days: attached, photos } = writing;
  const editing = target?.kind === "edit" ? target.id : undefined;
  const replyTo = target?.kind === "reply" ? target.id : undefined;
  const linkPreview = useLinkPreview(draft, writing.withoutPreview, (link) => {
    setWriting((before) => ({ ...before, withoutPreview: link }));
  });
  const chosen = useChosenPhotos({
    onRead: (read, message) => {
      setWriting((before) => picking(before, message, read));
    },
    onRemove: (photo) => {
      setWriting((before) => ({
        ...before,
        photos: before.photos.filter((other) => other !== photo),
      }));
    },
    photos,
  });
  const formRef = useRef<HTMLFormElement>(null);
  // An @ being written at the end of the message lists the others whose
  // name has what follows it, as LINE does; one picked goes in as @name
  // and a space.
  const query = mentionQuery(draft);
  const mentionable =
    query === undefined
      ? []
      : members.filter((member) => !member.me && member.name.includes(query));
  const setDraft = (words: string) => {
    setWriting((before) => ({ ...before, words }));
  };
  const setAttached = (days?: Date[]) => {
    setWriting((before) => ({ ...before, days }));
  };
  const pickMention = (member: Member) => {
    setWriting((before) => ({
      ...before,
      picked: [
        ...before.picked.filter((other) => other.id !== member.id),
        { id: member.id, name: member.name },
      ],
      words: pickingMention(before.words, member.name),
    }));
  };
  // Sent: a new message starts, still answering the line until the send
  // lets the reply go.
  const clear = () => {
    setWriting((before) => emptyWriting(before.target));
  };
  // Puts your message's words alone in the composer to change them.
  const startEditing = (message: Message) => {
    setWriting(changing(message, mentionName));
    formRef.current?.querySelector("textarea")?.focus();
  };
  const reply = (id: string) => {
    setWriting((before) => answering(before, id));
  };
  // × on the bar of the line answered or changed.
  const stop = () => {
    setWriting(stopping);
  };
  // Something to send, once every photo chosen has been read.
  const sendable =
    !chosen.reading &&
    (draft.trim() !== "" || attached !== undefined || photos.length > 0);
  return {
    attached,
    clear,
    draft,
    editing,
    formRef,
    handleChoosePhotos: async (files: File[]) =>
      await chosen.handleChoose(files, writing.message),
    handleRemovePhoto: chosen.handleRemove,
    linkPreview,
    mentionName,
    mentionable,
    photos,
    pickMention,
    picked,
    reply,
    replyTo,
    sendable,
    setAttached,
    setDraft,
    startEditing,
    stop,
    target,
  };
}

export type ComposerState = ReturnType<typeof useComposer>;

// One strip in the composer, over the words: the line being changed or
// answered, the days shared, or a link's page, with × to go without it.
function ComposerStrip({
  name,
  text,
  thumb,
  stopLabel,
  onStop,
}: {
  name: string;
  text: string;
  thumb?: string;
  stopLabel: string;
  onStop: () => void;
}) {
  return (
    <div className={chatStyle.replying}>
      <span className={chatStyle.quote}>
        <span className={chatStyle.quoteName}>{name}</span>
        <span className={chatStyle.quoteText}>{text}</span>
      </span>
      {thumb && <img alt="" className={chatStyle.quoteThumb} src={thumb} />}
      <IconButton glass={false} label={stopLabel} onClick={onStop}>
        <X aria-hidden="true" size={16} />
      </IconButton>
    </div>
  );
}

// What floats over the lines' top or foot (the pins, the composer): it
// sets how much of them it covers, --head-height or --foot-height, on
// their box, for the lines to end clear of it. As it grows the lines
// scroll by as much, so those past it stay where they are on the screen:
// at the foot, the latest stays in sight, as in the chat apps.
export function ChatEdge({
  edge,
  list,
  children,
}: {
  edge: "head" | "foot";
  list: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const edgeRef = useRef<HTMLDivElement>(null);
  // Before the chat puts its lines (a parent's layout effect runs after
  // this), so they are put with the room already there.
  useLayoutEffect(() => {
    const over = edgeRef.current;
    const box = over?.parentElement;
    if (!(over && box)) {
      return;
    }
    const name = `--${edge}-height`;
    let height = over.offsetHeight;
    box.style.setProperty(name, `${height}px`);
    const observer = new ResizeObserver(() => {
      const grown = over.offsetHeight - height;
      height = over.offsetHeight;
      box.style.setProperty(name, `${height}px`);
      // Over the head the lines stay as it shrinks too; at the foot the
      // room it gives back shows more below.
      if ((grown > 0 || edge === "head") && list.current) {
        list.current.scrollTop += grown;
      }
    });
    observer.observe(over);
    return () => {
      observer.disconnect();
    };
  }, [edge, list]);
  return (
    <div className={chatStyle[edge]} ref={edgeRef}>
      {children}
    </div>
  );
}

// Who left, in place of the composer, in a one-to-one chat.
export function GoneNote({ name }: { name: string }) {
  return (
    <p className={cx(floatingGlass, chatStyle.gone)}>
      {name}はグループを抜けました
    </p>
  );
}

// ＋ and what it opens over itself, as iOS 26's Messages: 日にちを共有
// nearest the button, then 写真.
function AttachMenu({
  onPhotos,
  onShareDays,
}: {
  onPhotos: () => void;
  onShareDays: () => void;
}) {
  return (
    <Menu.Root positioning={{ gutter: 8, placement: "top-start" }}>
      <Menu.Trigger
        aria-label="写真や日にちを送る"
        className={cx(floatingGlass, chatStyle.attach)}
      >
        <Plus aria-hidden="true" size={22} />
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content
          className={cx(
            floatingGlass,
            menuStyle.glassContent,
            chatStyle.attachMenu
          )}
        >
          <MenuItem
            icon={<CalendarPlus aria-hidden="true" size={18} />}
            onSelect={onShareDays}
            value="days"
          >
            日にちを共有
          </MenuItem>
          <MenuItem
            icon={<ImageIcon aria-hidden="true" size={18} />}
            onSelect={onPhotos}
            value="photos"
          >
            写真
          </MenuItem>
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

// The composer, as iOS 26's Messages: ＋ in a round of glass, and beside
// it one capsule of glass holding what the next message carries (the
// line it answers, days, a link's page, photos), the words and send. The
// @ list floats over it on its own.
export function Composer({
  composer,
  editingMessage,
  reply,
  onSend,
  onShareDays,
}: {
  composer: ComposerState;
  // Your message whose words are being changed.
  editingMessage?: Message;
  // The line being answered, by whom, and stopping.
  reply?: { message: Message; writer: string; onStop: () => void };
  onSend: () => void;
  // Opens the days to share. Without it, as in the support chat, ＋ is
  // the photos alone, with no menu to open first.
  onShareDays?: () => void;
}) {
  const {
    attached,
    draft,
    editing,
    formRef,
    linkPreview,
    mentionable,
    mentionName,
    photos,
  } = composer;
  const platform = useDevice((state) => state.platform);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const choosePhotos = () => {
    photoInputRef.current?.click();
  };
  // A strip sits over the words, which the photos chosen go under.
  const stripped =
    editingMessage !== undefined ||
    reply !== undefined ||
    attached !== undefined ||
    linkPreview.shown !== undefined;
  return (
    <>
      {mentionable.length > 0 && (
        <ul
          aria-label="メンションする人"
          className={cx(floatingGlass, chatStyle.mentionList)}
        >
          {mentionable.map((member) => (
            <li key={member.id}>
              <button
                className={chatStyle.mentionPick}
                onClick={() => {
                  composer.pickMention(member);
                }}
                // The field keeps focus, and the keyboard stays up.
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                type="button"
              >
                <Avatar member={member} size={28} />
                {member.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={chatStyle.composer}
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        ref={formRef}
      >
        <PhotoInput
          onChoose={composer.handleChoosePhotos}
          ref={photoInputRef}
        />
        {/* A message being changed takes only words, and the capsule
            takes the row. */}
        {editing === undefined &&
          (onShareDays ? (
            <AttachMenu onPhotos={choosePhotos} onShareDays={onShareDays} />
          ) : (
            <button
              aria-label="写真を送る"
              className={cx(floatingGlass, chatStyle.attach)}
              onClick={choosePhotos}
              type="button"
            >
              <ImageIcon aria-hidden="true" size={20} />
            </button>
          ))}
        <div className={cx(floatingGlass, chatStyle.capsule)}>
          {editingMessage && (
            <ComposerStrip
              name="メッセージを編集"
              onStop={() => {
                composer.stop();
              }}
              stopLabel="編集をやめる"
              text={summaryOf(editingMessage, mentionName)}
            />
          )}
          {reply && (
            <ComposerStrip
              name={`${reply.writer}に返信`}
              onStop={() => {
                reply.onStop();
              }}
              stopLabel="返信をやめる"
              text={summaryOf(reply.message, mentionName)}
              thumb={
                reply.message.content.kind === "photos"
                  ? reply.message.content.photos[0]?.src
                  : undefined
              }
            />
          )}
          {attached && (
            <ComposerStrip
              name="共有する日"
              onStop={() => {
                composer.setAttached(undefined);
              }}
              stopLabel="共有をやめる"
              text={daysSummary(attached)}
            />
          )}
          {linkPreview.shown && (
            <ComposerStrip
              name={linkPreview.ready?.site ?? siteOf(linkPreview.shown)}
              onStop={linkPreview.handleSkip}
              stopLabel="リンクのプレビューを付けない"
              text={linkPreview.ready?.title ?? "読み込み中…"}
              thumb={linkPreview.ready?.image}
            />
          )}
          <PhotoTray
            below={stripped}
            onRemove={composer.handleRemovePhoto}
            photos={photos}
          />
          <div className={chatStyle.fieldRow}>
            <LimitedTextArea
              aria-label="メッセージ"
              className={chatStyle.composerInput}
              kind="chatMessage"
              onValueChange={(text) => {
                composer.setDraft(text);
              }}
              // Images pasted go with the next send, as photos picked do;
              // words paste as ever. A message being changed takes none.
              onPaste={(event) => {
                const images = [...event.clipboardData.files].filter((file) =>
                  file.type.startsWith("image/")
                );
                if (images.length === 0 || editing !== undefined) {
                  return;
                }
                event.preventDefault();
                composer.handleChoosePhotos(images).catch(() => undefined);
              }}
              placeholder="メッセージ"
              value={draft}
            />
            {editing === undefined ? (
              <button
                aria-label="送る"
                className={chatStyle.send}
                disabled={!composer.sendable}
                type="submit"
              >
                {/* Each platform's own: Messages' arrow up on iOS,
                    Material's send on Android. */}
                {platform === "ios" ? (
                  <ArrowUp aria-hidden="true" size={18} strokeWidth={2.5} />
                ) : (
                  <SendHorizontal aria-hidden="true" size={16} />
                )}
              </button>
            ) : (
              // Saves rather than sends: a check, as Telegram and LINE show
              // while a message is changed. Emptying it does not delete it.
              <button
                aria-label="編集を保存"
                className={chatStyle.send}
                disabled={draft.trim() === ""}
                type="submit"
              >
                <Check aria-hidden="true" size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}

// How long the server takes to read a page in the prototype.
const readMs = 700;

// The preview of the first link being written, as the chat apps make one
// before sending: read from the server once the link settles, shown over
// the composer, and sent with the message unless taken off with ×. A
// message sent before it is read goes without one.
function useLinkPreview(
  draft: string,
  skipped: string | undefined,
  onSkip: (link?: string) => void
) {
  const first = firstLink(draft);
  // An invitation's card comes from its group as the message shows, so
  // nothing is read or held above the composer for it.
  const link = first && !inviteCodeOf(first) ? first : undefined;
  const [settled, setSettled] = useState<string>();
  const [pages, setPages] = useState<Record<string, LinkPreview>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!link) {
      return;
    }
    const timers = [
      window.setTimeout(() => {
        setSettled(link);
      }, chatRules.linkPreviewSettleMs),
    ];
    if (!asked.current.has(link)) {
      timers.push(
        window.setTimeout(() => {
          asked.current.add(link);
          setPages((before) => ({ ...before, [link]: previewOf(link) }));
        }, chatRules.linkPreviewSettleMs + readMs)
      );
    }
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [link]);
  const shown =
    link !== undefined && link === settled && link !== skipped
      ? link
      : undefined;
  return {
    handleSkip: () => {
      onSkip(link);
    },
    ready: shown ? pages[shown] : undefined,
    shown,
  };
}
