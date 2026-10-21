import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { describe, expect, it } from "vitest";

import migrations from "../src/group-do-migrations/migrations.js";

// chat_lines as 0036 left it: what a line was said by which of its
// columns were set.
const OLD_CHAT_LINES = [
  `CREATE TABLE chat_lines (
    author_id text NOT NULL, created_cursor integer NOT NULL,
    cursor integer NOT NULL, edited integer DEFAULT false NOT NULL,
    op_id text NOT NULL, sent_at integer NOT NULL, seq integer NOT NULL,
    text text NOT NULL, thread_id text NOT NULL,
    unsent integer DEFAULT false NOT NULL, pinned_at integer, days text,
    decided text, poll integer DEFAULT false NOT NULL, preview text,
    hidden_from text, reply_to integer, notice text, device text, photos text,
    PRIMARY KEY(thread_id, seq))`,
  "CREATE UNIQUE INDEX chat_lines_cursor ON chat_lines (cursor)",
  "CREATE UNIQUE INDEX chat_lines_op ON chat_lines (op_id)",
  'CREATE INDEX chat_lines_photos ON chat_lines (thread_id, seq) WHERE "chat_lines"."photos" is not null',
];

const PREVIEW = {
  imageHeight: 10,
  imageId: "img",
  imageWidth: 20,
  site: "cafe",
  title: "Cafe",
  url: "https://cafe.example",
};
const PHOTO = { height: 3, id: "p1", thumbHash: "aGFzaA==", width: 4 };

type OldLine = {
  seq: number;
  text?: string;
  edited?: boolean;
  unsent?: boolean;
  days?: string[];
  poll?: boolean;
  decided?: string;
  preview?: object;
  notice?: object;
  photos?: object[];
  replyTo?: number;
  pinnedAt?: number;
};

// The lines, one of each kind as the old columns said it, and the
// shapes 0036 and unsendLine left: a poll taken back still marked poll.
const OLD_LINES: OldLine[] = [
  { notice: { kind: "joined" }, seq: 1 },
  { edited: true, preview: PREVIEW, seq: 2, text: "ここ https://cafe.example" },
  { replyTo: 2, seq: 3, text: "いいね" },
  { photos: [PHOTO], pinnedAt: 7, seq: 4, text: "" },
  { days: ["2026-10-05", "2026-10-06"], seq: 5, text: "" },
  {
    days: ["2026-10-05", "2026-10-06"],
    decided: "2026-10-06",
    poll: true,
    seq: 6,
    text: "",
  },
  { poll: true, seq: 7, text: "", unsent: true },
  {
    notice: { kind: "profileChanged", markChanged: true, name: "新しい名前" },
    seq: 8,
  },
];

/** Puts chat_lines back as it was before 0037, holding `lines`, for the Group DO to migrate again. */
const asBefore0037 = (sql: SqlStorage, lines: OldLine[]): void => {
  const from = migrations.journal.entries.find(({ idx }) => idx === 37)?.when;
  sql.exec("DROP TABLE chat_lines");
  for (const statement of OLD_CHAT_LINES) {
    sql.exec(statement);
  }
  sql.exec("DELETE FROM __drizzle_migrations WHERE created_at >= ?", from);
  for (const line of lines) {
    sql.exec(
      `INSERT INTO chat_lines (author_id, created_cursor, cursor, edited, op_id,
        sent_at, seq, text, thread_id, unsent, pinned_at, days, decided, poll,
        preview, reply_to, notice, photos)
      VALUES ('u1', ?1, ?1, ?2, ?3, 0, ?1, ?4, 'group', ?5, ?6, ?7, ?8, ?9, ?10,
        ?11, ?12, ?13)`,
      line.seq,
      line.edited === true ? 1 : 0,
      `op-${line.seq}`,
      line.text ?? "",
      line.unsent === true ? 1 : 0,
      line.pinnedAt ?? null,
      line.days === undefined ? null : JSON.stringify(line.days),
      line.decided ?? null,
      line.poll === true ? 1 : 0,
      line.preview === undefined ? null : JSON.stringify(line.preview),
      line.replyTo ?? null,
      line.notice === undefined ? null : JSON.stringify(line.notice),
      line.photos === undefined ? null : JSON.stringify(line.photos)
    );
  }
};

describe("a Group DO whose chat lines are of the shape before 0037", () => {
  it("keeps each line's kind and what it holds as its content", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const rows = await runInDurableObject(
      env.GROUPS.getByName("old-chat-lines"),
      async (_, state) => {
        asBefore0037(state.storage.sql, OLD_LINES);
        await migrate(drizzle(state.storage), migrations);
        return state.storage.sql
          .exec<{
            content: string;
            pinned_at: number | null;
            reply_to: number | null;
            seq: number;
          }>(
            "SELECT seq, content, reply_to, pinned_at FROM chat_lines ORDER BY seq"
          )
          .toArray()
          .map((row) => {
            const content: unknown = JSON.parse(row.content);
            return { ...row, content };
          });
      }
    );
    expect(rows).toStrictEqual([
      {
        content: { kind: "notice", notice: { kind: "joined" } },
        pinned_at: null,
        reply_to: null,
        seq: 1,
      },
      {
        content: {
          edited: true,
          kind: "words",
          preview: PREVIEW,
          text: "ここ https://cafe.example",
        },
        pinned_at: null,
        reply_to: null,
        seq: 2,
      },
      {
        content: {
          edited: false,
          kind: "words",
          preview: null,
          text: "いいね",
        },
        pinned_at: null,
        reply_to: 2,
        seq: 3,
      },
      {
        content: { kind: "photos", photos: [PHOTO] },
        pinned_at: 7,
        reply_to: null,
        seq: 4,
      },
      {
        content: { days: ["2026-10-05", "2026-10-06"], kind: "days" },
        pinned_at: null,
        reply_to: null,
        seq: 5,
      },
      {
        content: {
          days: ["2026-10-05", "2026-10-06"],
          decided: "2026-10-06",
          kind: "poll",
        },
        pinned_at: null,
        reply_to: null,
        seq: 6,
      },
      { content: { kind: "unsent" }, pinned_at: null, reply_to: null, seq: 7 },
      {
        content: {
          kind: "notice",
          notice: {
            kind: "profileChanged",
            markChanged: true,
            name: "新しい名前",
          },
        },
        pinned_at: null,
        reply_to: null,
        seq: 8,
      },
    ]);
  });

  it("takes words, and refuses a line with nothing in it or of a kind it does not know", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const refused = await runInDurableObject(
      env.GROUPS.getByName("new-chat-lines"),
      (_, state) =>
        [
          { kind: "words", text: "ことば" },
          { kind: "words", text: "" },
          { kind: "photos", photos: [] },
          { kind: "poll" },
          { kind: "letter" },
          {},
        ].map((content, seq) => {
          try {
            state.storage.sql.exec(
              `INSERT INTO chat_lines (author_id, content, created_cursor, cursor,
                op_id, sent_at, seq, thread_id)
              VALUES ('u1', ?1, ?2, ?2, ?3, 0, ?2, 'group')`,
              JSON.stringify({ edited: false, ...content }),
              seq + 1,
              `op-${seq}`
            );
            return false;
          } catch {
            return true;
          }
        })
    );
    expect(refused).toStrictEqual([false, true, true, true, true, true]);
  });
});
