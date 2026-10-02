import { chatRules } from "@pochical/design/chat";
import {
  CalendarPlus,
  Check,
  ChevronRight,
  ImageIcon,
  SendHorizontal,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import {
  firstLink,
  inviteCodeOf,
  mentionsOf,
  plainText,
  siteOf,
} from "../lib/chat-text";
import { spring } from "../lib/motion";
import { PhotoInput, PhotoTray, useChosenPhotos } from "./design-chat-photos";
import { chatStyle } from "./design-chat-style";
import { daysSummary, summaryOf } from "./design-chat-summary";
import type { LinkPreview, Member, Message } from "./design-group-data";
import { Avatar } from "./design-group-parts";
import { previewOf } from "./design-group-samples";
import { IconButton, LimitedTextArea } from "./design-ui";

// Writing in a chat: what is being written (useComposer), the page of a
// link as it is written, and the composer at the chat's foot.

type Mention = { id: string; name: string };

// What is being written: the words, the members picked from the @ list,
// days brought from the shift table, photos chosen, the page of its first
// link, and your message whose words are being changed instead.
export function useComposer({
  attach,
  members,
  mentionName,
}: {
  attach?: Date[];
  // Who an @ lists: the others in the group chat, none in a one-to-one.
  members: Member[];
  mentionName: (id: string) => string;
}) {
  const [draft, setDraft] = useState("");
  // Members picked from the @ list, made mentions as the message is sent.
  const [picked, setPicked] = useState<Mention[]>([]);
  const [attached, setAttached] = useState(attach);
  const linkPreview = useLinkPreview(draft);
  const chosen = useChosenPhotos();
  const [editing, setEditing] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  // An @ being written at the end of the message lists the others whose
  // name has what follows it, as LINE does; one picked goes in as @name
  // and a space.
  const mentionQuery = MENTION_QUERY.exec(draft)?.groups?.query;
  const mentionable =
    mentionQuery === undefined
      ? []
      : members.filter(
          (member) => !member.me && member.name.includes(mentionQuery)
        );
  const pickMention = (member: Member) => {
    setDraft(draft.replace(MENTION_QUERY, `@${member.name} `));
    setPicked((before) => [
      ...before.filter((other) => other.id !== member.id),
      { id: member.id, name: member.name },
    ]);
  };
  const clear = () => {
    setDraft("");
    setPicked([]);
    linkPreview.reset();
    setAttached(undefined);
    chosen.clear();
  };
  // Puts your message's words back in the composer to change them, its
  // mentions as @name again.
  const startEditing = (message: Message) => {
    const text = message.text ?? "";
    setEditing(message.id);
    setDraft(plainText(text, mentionName));
    setPicked(mentionsOf(text).map((id) => ({ id, name: mentionName(id) })));
    formRef.current?.querySelector("textarea")?.focus();
  };
  const stopEditing = () => {
    setEditing(undefined);
    setDraft("");
    setPicked([]);
    linkPreview.reset();
  };
  // Something to send, once every photo chosen has been read.
  const sendable =
    !chosen.reading &&
    (draft.trim() !== "" || attached !== undefined || chosen.photos.length > 0);
  return {
    attached,
    clear,
    draft,
    editing,
    formRef,
    handleChoosePhotos: chosen.handleChoose,
    handleRemovePhoto: chosen.handleRemove,
    linkPreview,
    mentionable,
    photos: chosen.photos,
    pickMention,
    picked,
    sendable,
    setAttached,
    setDraft,
    startEditing,
    stopEditing,
  };
}

type ComposerState = ReturnType<typeof useComposer>;

// The foot of the chat: what the next message carries (the line it
// answers, days, a link's page, photos), the @ list, and the field with
// its tools and send.
export function Composer({
  composer,
  editingMessage,
  replying,
  onStopReplying,
  nameOf,
  mentionName,
  onSend,
  onShareDays,
}: {
  composer: ComposerState;
  // Your message whose words are being changed, or the one being answered.
  editingMessage?: Message;
  replying?: Message;
  onStopReplying: () => void;
  nameOf: (id: string) => string;
  mentionName: (id: string) => string;
  onSend: () => void;
  onShareDays: () => void;
}) {
  const {
    attached,
    draft,
    editing,
    formRef,
    linkPreview,
    mentionable,
    photos,
  } = composer;
  const photoInputRef = useRef<HTMLInputElement>(null);
  // While the field is in use, the tools fold into a ›, as in LINE,
  // giving it their room: from the moment it is tapped, and while words
  // wait in it. › opens them until the next letter.
  const [writing, setWriting] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsFolded = (writing || draft !== "") && !toolsOpen;
  let toolsWidth = toolsFolded ? toolWidth : toolWidth * toolCount;
  // A message being changed keeps what it carries; only its words change.
  if (editing !== undefined) {
    toolsWidth = 0;
  }
  return (
    <>
      {editingMessage && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>メッセージを編集</span>
            <span className={chatStyle.quoteText}>
              {summaryOf(editingMessage, mentionName)}
            </span>
          </span>
          <IconButton
            glass={false}
            label="編集をやめる"
            onClick={() => {
              composer.stopEditing();
            }}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      {replying && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>
              {nameOf(replying.from)}に返信
            </span>
            <span className={chatStyle.quoteText}>
              {summaryOf(replying, mentionName)}
            </span>
          </span>
          {replying.photo && (
            <img
              alt=""
              className={chatStyle.quoteThumb}
              src={replying.photo.src}
            />
          )}
          <IconButton
            glass={false}
            label="返信をやめる"
            onClick={onStopReplying}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      {attached && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>共有する日</span>
            <span className={chatStyle.quoteText}>{daysSummary(attached)}</span>
          </span>
          <IconButton
            glass={false}
            label="共有をやめる"
            onClick={() => {
              composer.setAttached(undefined);
            }}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      {linkPreview.shown && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>
              {linkPreview.ready?.site ?? siteOf(linkPreview.shown)}
            </span>
            <span className={chatStyle.quoteText}>
              {linkPreview.ready?.title ?? "読み込み中…"}
            </span>
          </span>
          {linkPreview.ready?.image && (
            <img
              alt=""
              className={chatStyle.quoteThumb}
              src={linkPreview.ready.image}
            />
          )}
          <IconButton
            glass={false}
            label="リンクのプレビューを付けない"
            onClick={linkPreview.handleSkip}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      <PhotoTray
        below={
          replying !== undefined ||
          attached !== undefined ||
          linkPreview.shown !== undefined
        }
        onRemove={composer.handleRemovePhoto}
        photos={photos}
      />
      {mentionable.length > 0 && (
        <ul aria-label="メンションする人" className={chatStyle.mentionList}>
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
        className={chatStyle.composer({
          replying:
            editing !== undefined ||
            replying !== undefined ||
            attached !== undefined ||
            linkPreview.shown !== undefined ||
            photos.length > 0 ||
            mentionable.length > 0,
        })}
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
        {/* The tools narrow into a › and widen back, the field following
          them, while the icons and the › fade one into the other. */}
        <motion.span
          animate={{ width: toolsWidth }}
          className={chatStyle.composerTools}
          initial={false}
          transition={toolFold}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {editing === undefined && toolsFolded && (
              <motion.button
                animate={{ opacity: 1, scale: 1 }}
                aria-label="写真と日にちのボタンを表示"
                className={chatStyle.composerButton({ tool: true })}
                exit={{ opacity: 0, scale: 0.6 }}
                initial={{ opacity: 0, scale: 0.6 }}
                key="more"
                onClick={() => {
                  setToolsOpen(true);
                }}
                // The field keeps focus (and the keyboard stays up), so
                // the tools do not open under the finger as it leaves.
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                transition={toolFold}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={22} />
              </motion.button>
            )}
            {editing === undefined && !toolsFolded && (
              <motion.span
                animate={{ opacity: 1, x: 0 }}
                className={chatStyle.composerToolRow}
                exit={{ opacity: 0, x: -toolWidth }}
                initial={{ opacity: 0, x: -toolWidth }}
                key="tools"
                transition={toolFold}
              >
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
                <button
                  aria-label="日にちを共有"
                  className={chatStyle.composerButton({ tool: true })}
                  onClick={() => {
                    onShareDays();
                  }}
                  type="button"
                >
                  <CalendarPlus aria-hidden="true" size={20} />
                </button>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
        <LimitedTextArea
          aria-label="メッセージ"
          className={chatStyle.composerInput}
          kind="chatMessage"
          onBlur={() => {
            setWriting(false);
          }}
          onValueChange={(text) => {
            composer.setDraft(text);
            setToolsOpen(false);
          }}
          onFocus={() => {
            setWriting(true);
            setToolsOpen(false);
          }}
          placeholder="メッセージ"
          value={draft}
        />
        {editing === undefined ? (
          <button
            aria-label="送る"
            className={chatStyle.composerButton({ send: true })}
            disabled={!composer.sendable}
            type="submit"
          >
            <SendHorizontal aria-hidden="true" size={18} />
          </button>
        ) : (
          // Saves rather than sends: a check, as Telegram and LINE show
          // while a message is changed. Emptying it does not delete it.
          <button
            aria-label="編集を保存"
            className={chatStyle.composerButton({ send: true })}
            disabled={draft.trim() === ""}
            type="submit"
          >
            <Check aria-hidden="true" size={20} />
          </button>
        )}
      </form>
    </>
  );
}

// An @ and what follows it at the end of the message being written; a
// space ends it.
const MENTION_QUERY = /@(?<query>[^\s@]*)$/u;

// The composer's tools: each one's width, how many, and how they fold
// into a › and back, as quick as the calendar's own fold.
const toolWidth = 32;

const toolCount = 2;

const toolFold = spring("quick");

// How long the server takes to read a page in the prototype.
const readMs = 700;

// The preview of the first link being written, as the chat apps make one
// before sending: read from the server once the link settles, shown over
// the composer, and sent with the message unless taken off with ×. A
// message sent before it is read goes without one.
function useLinkPreview(draft: string) {
  const first = firstLink(draft);
  // An invitation's card comes from its group as the message shows, so
  // nothing is read or held above the composer for it.
  const link = first && !inviteCodeOf(first) ? first : undefined;
  const [settled, setSettled] = useState<string>();
  const [skipped, setSkipped] = useState<string>();
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
      setSkipped(link);
    },
    // A new message starts with previews back on.
    reset: () => {
      setSkipped(undefined);
    },
    ready: shown ? pages[shown] : undefined,
    shown,
  };
}
