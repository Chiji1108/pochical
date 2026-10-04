import { chatRules } from "@pochical/design/chat";
import { useContext, useState } from "react";

import {
  decidePoll,
  editMessage,
  pinMessage,
  reactTo,
  unsendMessage,
  votePoll,
} from "../lib/chat-messages";
import { plainText, withMentions } from "../lib/chat-text";
import { dateKey, formatDay } from "../lib/design-days";
import type { LineActions } from "./design-chat-actions";
import type { ComposerState } from "./design-chat-composer";
import type { Message } from "./design-group-data";
import { ToastContext } from "./design-toast";

// What changes a chat's lines: sending, replying and editing, reactions,
// pins, votes and settling a poll, taking a line back; and which line is
// being acted on meanwhile (its actions open, answered, reacted to from
// every emoji, reported, taken back or settled), each asked about first.
export function useChatEdits({
  messages,
  onChange,
  composer,
  mentionName,
  onSent,
}: {
  messages: Message[];
  onChange: (messages: Message[]) => void;
  composer: ComposerState;
  mentionName: (id: string) => string;
  // Lines just sent, for what follows a send: a photo's upload, someone
  // writing back.
  onSent: (sent: Message[]) => void;
}) {
  const toast = useContext(ToastContext);
  // The line whose actions are open, and the one being answered.
  const [selected, setSelected] = useState<string>();
  const [replyTo, setReplyTo] = useState<string>();
  // The line whose reaction is being picked from every emoji.
  const [pickingFor, setPickingFor] = useState<string>();
  // Rung, as a pin or a quote jumped to it.
  const [flash, setFlash] = useState<string>();
  // Your message being taken back, asked about first.
  const [unsending, setUnsending] = useState<string>();
  // Someone else's message being reported.
  const [reporting, setReporting] = useState<string>();
  // The poll being settled by its writer.
  const [deciding, setDeciding] = useState<string>();
  const { editing } = composer;
  const byId = (id?: string) => messages.find((message) => message.id === id);
  // Sends one line or several at once, the first answering the line
  // being replied to.
  const post = (...lines: Omit<Message, "id" | "from" | "when" | "time">[]) => {
    const sent = lines.map((line, index) => ({
      ...line,
      from: "me",
      id: `sent-${messages.length + index}`,
      replyTo: index === 0 ? replyTo : undefined,
      time: "10:10",
      when: "今日",
    }));
    onChange([...messages, ...sent]);
    setReplyTo(undefined);
    onSent(sent);
  };
  const startEditing = (message: Message) => {
    setReplyTo(undefined);
    composer.startEditing(message);
  };
  const pin = (id: string, pinned: boolean) => {
    const next = pinMessage(messages, id, pinned);
    onChange(next.messages);
    if (next.dropped) {
      toast(droppedPinLine);
    } else {
      toast(pinned ? "ピン留めしました" : "ピン留めを外しました");
    }
  };
  const decide = (id: string, key: string) => {
    const next = decidePoll(messages, id, key);
    onChange(next.messages);
    setDeciding(undefined);
    const day = byId(id)?.poll?.days.find((date) => dateKey(date) === key);
    const decided = day ? `${formatDay(day)}に決めました` : undefined;
    if (next.dropped) {
      toast(decided ? `${decided}。${droppedPinLine}` : droppedPinLine);
    } else if (decided) {
      toast(decided);
    }
  };
  const vote = (id: string, key: string) => {
    onChange(votePoll(messages, id, key));
  };
  const unsend = (id: string) => {
    onChange(unsendMessage(messages, id));
    setUnsending(undefined);
    if (editing === id) {
      composer.stopEditing();
    }
  };
  // A photo that could not be sent, taken out of the chat.
  const remove = (id: string) => {
    onChange(messages.filter((message) => message.id !== id));
  };
  const send = () => {
    const text = composer.draft.trim();
    // The changed words replace the old ones, marked 編集済み; the page of
    // its link stays while the link does.
    if (editing !== undefined) {
      if (text) {
        onChange(
          editMessage(
            messages,
            editing,
            withMentions(text, composer.picked),
            composer.linkPreview.ready
          )
        );
        composer.stopEditing();
      }
      return;
    }
    if (!composer.sendable) {
      return;
    }
    // The attached days go first, then each photo as a line of its own,
    // then what was written, if anything.
    post(
      ...(composer.attached ? [{ days: composer.attached }] : []),
      ...composer.photos.map((photo) => ({ photo })),
      ...(text
        ? [
            {
              link: composer.linkPreview.ready,
              text: withMentions(text, composer.picked),
            },
          ]
        : [])
    );
    composer.clear();
  };
  const react = (id: string, emoji: string) => {
    onChange(reactTo(messages, id, emoji));
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
  const actionsOf = (message: Message): LineActions => ({
    mine: message.from === "me",
    onEdit:
      message.from === "me" && message.text !== undefined
        ? () => {
            startEditing(message);
          }
        : undefined,
    onMore: () => {
      setSelected(undefined);
      setPickingFor(message.id);
    },
    onOpenChange: (open: boolean) => {
      setSelected(open ? message.id : undefined);
    },
    onPin:
      message.notice || message.unsent
        ? undefined
        : () => {
            pin(message.id, message.pinned === undefined);
          },
    onReact: (emoji: string) => {
      react(message.id, emoji);
    },
    onReply: () => {
      if (editing !== undefined) {
        composer.stopEditing();
      }
      setReplyTo(message.id);
      setSelected(undefined);
    },
    onReport:
      message.from === "me"
        ? undefined
        : () => {
            setReporting(message.id);
          },
    onUnsend:
      message.from === "me"
        ? () => {
            setUnsending(message.id);
          }
        : undefined,
    open: selected === message.id,
    pinned: message.pinned !== undefined,
    text:
      message.text === undefined
        ? undefined
        : plainText(message.text, mentionName),
  });
  return {
    actionsOf,
    byId,
    decide,
    deciding,
    flash,
    jumpTo,
    pickingFor,
    pin,
    post,
    react,
    remove,
    replyTo,
    reporting,
    selected,
    send,
    setDeciding,
    setPickingFor,
    setReplyTo,
    setReporting,
    setSelected,
    setUnsending,
    unsend,
    unsending,
    vote,
  };
}

const flashMilliseconds = 1200;

// Said when one more pin takes the place of the oldest.
const droppedPinLine = `ピン留めは${chatRules.maxPins}件までです。いちばん古いものを外しました`;
