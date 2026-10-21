import { syncLimits } from "@pochical/design/limits";
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { describe, expect, test } from "vitest";

// The cases every platform checks its own code against (spec/vectors).
import chatPhotos from "../../../spec/vectors/chat-photos.json";
import chatText from "../../../spec/vectors/chat-text.json";
import chat from "../../../spec/vectors/chat.json";
import hlc from "../../../spec/vectors/hlc.json";
import orderClears from "../../../spec/vectors/order-clears.json";
import text from "../../../spec/vectors/text.json";
import unread from "../../../spec/vectors/unread.json";
import { inviteCodeOf, textParts } from "../src/chat-links";
import { pinStep } from "../src/chat-pins";
import { DayField } from "../src/gen/pochical/v1/sync_pb";
import { directThread, plainText, unreadCount } from "../src/group-chat";
import { chatLines, readMarks } from "../src/group-do-schema";
import { compareClocks, isAhead } from "../src/hlc";
import { givesWay, heldBackBy } from "../src/order-clears";
import { characterCount, fitsText, isEmoji } from "../src/text-limits";
import { notifyingCount } from "../src/user-do-values";
import { photosAmong } from "./helpers";

// Which thread two members' one-to-one chat is, as their apps name it.
describe("spec/vectors/chat.json", () => {
  test.each(chatText.plainText)(
    "plainText: $text",
    ({ text: words, names, expected }) => {
      const byId = new Map(Object.entries(names));
      expect(plainText(words, (id) => byId.get(id) ?? id)).toBe(expected);
    }
  );

  test.each(chatText.textParts)(
    "textParts: $name",
    ({ text: words, expected }) => {
      expect(textParts(words)).toStrictEqual(expected);
    }
  );

  test.each(chatText.inviteCode)("inviteCode: $url", ({ url, expected }) => {
    expect(inviteCodeOf(url) ?? null).toBe(expected);
  });

  test.each(chat.directThread)("directThread: $name", ({ a, b, expected }) => {
    expect(directThread(a, b)).toBe(expected);
  });

  test.each(chat.pins)("pins: $name", ({ pins, step, expected }) => {
    expect(pinStep(pins, step)).toStrictEqual(expected);
  });
});

describe("spec/vectors/hlc.json", () => {
  test.each(hlc.compare)("$name", ({ a, b, expected }) => {
    expect(Math.sign(compareClocks(a, b))).toBe(expected);
  });

  test.each(hlc.ahead)("$name", ({ now, pastLimitMs, expected }) => {
    const ms = now + syncLimits.clockAheadMs + pastLimitMs;
    expect(isAhead({ counter: 0, device: "phone", ms }, now)).toBe(expected);
  });
});

// The server holds text to the limits with its own count, and marks to
// one emoji, which must be the apps'.
describe("spec/vectors/text.json", () => {
  test.each(text.characterCount)("$name", ({ text: written, expected }) => {
    expect(characterCount(written)).toBe(expected);
  });

  test.each(text.isEmoji)("isEmoji: $name", ({ text: written, expected }) => {
    expect(isEmoji(written)).toBe(expected);
  });

  test.each(text.fitsText)(
    "fitsText: $name",
    ({ text: written, limit, expected }) => {
      expect(fitsText(written, limit)).toBe(expected);
    }
  );
});

// The vectors name fields as DayField does, without DAY_FIELD_.
const FIELDS: Record<string, DayField | undefined> = {
  END: DayField.END,
  NOTE: DayField.NOTE,
  PATTERN: DayField.PATTERN,
  PEOPLE: DayField.PEOPLE,
  START: DayField.START,
};
const fieldOf = (name: string): DayField =>
  FIELDS[name] ?? DayField.UNSPECIFIED;

describe("spec/vectors/order-clears.json", () => {
  test.each(orderClears.givesWay)(
    "gives way: $name",
    ({ date, expected, field, floor, set }) => {
      expect(givesWay(date, fieldOf(field), set, floor)).toBe(expected);
    }
  );

  test.each(orderClears.heldBackBy)(
    "held back: $name",
    ({ date, expected, field, floors, set }) => {
      expect(heldBackBy(floors, date, fieldOf(field), set)?.from ?? null).toBe(
        expected
      );
    }
  );
});

describe("spec/vectors/chat-photos.json", () => {
  // A seen line's kind as a line laid in the database holds it.
  const seenPhotos: Record<string, number | "unsent"> = {
    photos: 1,
    unsent: "unsent",
    words: 0,
  };

  // The group's own answer, from its database: the line alone in its chat,
  // counted among the reader's photos or not.
  test.each(chatPhotos.seen)("seen: $name", async ({ line, expected }) => {
    const threadId = line.ownChat ? "group" : directThread("reader", "writer");
    const { total } = await photosAmong({
      after: false,
      blocked: line.writerBlocked ? ["writer"] : [],
      lines: [
        {
          authorId: "writer",
          hiddenFrom: line.hidden ? "reader" : undefined,
          photos: seenPhotos[line.kind] ?? 0,
          seq: 1,
          threadId,
        },
      ],
      seq: 0,
      threadId,
      userId: "reader",
    });
    expect(total).toBe(expected ? 1 : 0);
  });

  // The chat's lines from the first, each holding the photos its seq
  // names, words where none is.
  test.each(chatPhotos.page)(
    "page: $name",
    async ({ photos, seq, after, size, expected }) => {
      const seqs = photos.map((name) => Number(name.slice(0, -1)));
      const last = Math.max(seq, ...seqs);
      const lines = Array.from({ length: last }, (_, index) => ({
        authorId: "writer",
        photos: seqs.filter((each) => each === index + 1).length,
        seq: index + 1,
      }));
      await expect(
        photosAmong({ after, lines, seq, size, userId: "reader" })
      ).resolves.toStrictEqual(expected);
    }
  );
});

describe("spec/vectors/unread.json", () => {
  type Chat = { muted: boolean; read: string[]; unread: string[] };

  // A chat's unread lines and their mentions of `me`, as its group counts
  // them from its database.
  const countedIn = async ({ read, unread: lines }: Chat) =>
    await runInDurableObject(
      env.GROUPS.getByName(crypto.randomUUID()),
      (_, state) => {
        const db = drizzle(state.storage);
        for (const [index, words] of [...read, ...lines].entries()) {
          db.insert(chatLines)
            .values({
              authorId: "yuki",
              content: {
                edited: false,
                kind: "words",
                preview: null,
                text: words,
              },
              createdCursor: index + 1,
              cursor: index + 1,
              opId: `op-${index}`,
              sentAt: new Date(index),
              seq: index + 1,
              threadId: "group",
            })
            .run();
        }
        db.insert(readMarks)
          .values({
            cursor: read.length + lines.length + 1,
            lastReadSeq: read.length,
            threadId: "group",
            userId: "me",
          })
          .run();
        return unreadCount(db, "me", "group");
      }
    );

  test.each(unread.notifying)(
    "$name",
    async ({ expected, groups, mentionsWhenMuted }) => {
      const counts = await Promise.all(
        groups
          .flatMap((group) => group.chats)
          .map(async (one) =>
            notifyingCount(await countedIn(one), one.muted, mentionsWhenMuted)
          )
      );
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(expected);
    }
  );
});
