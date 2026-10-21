import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { describe, expect, it } from "vitest";

import fill from "../src/group-do-migrations/0038_chat-line-content-fill.sql";
import contentOnly from "../src/group-do-migrations/0039_chat-line-content-only.sql";
import migrations from "../src/group-do-migrations/migrations.js";
import { chatLinesBefore } from "./old-chat-lines";
import type { OldLine } from "./old-chat-lines";

const PREVIEW = {
  imageHeight: 10,
  imageId: "img",
  imageWidth: 20,
  site: "cafe",
  title: "Cafe",
  url: "https://cafe.example",
};
const PHOTO = { height: 3, id: "p1", thumbHash: "aGFzaA==", width: 4 };

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

describe("a Group DO whose chat lines are of the shape before 0037", () => {
  it("keeps each line's kind and what it holds as its content", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const rows = await runInDurableObject(
      env.GROUPS.getByName("old-chat-lines"),
      async (_, state) => {
        chatLinesBefore(state.storage.sql, 37, OLD_LINES);
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

  it("gives a device catching up after it each line as what it is", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { changesIn, pair, syncSocket } = await import("./sync-helpers");
    const { groupId, maker } = await pair();
    await runInDurableObject(
      env.GROUPS.getByName(groupId),
      async (_, state) => {
        chatLinesBefore(state.storage.sql, 37, OLD_LINES);
        await migrate(drizzle(state.storage), migrations);
      }
    );
    const { frames } = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      maker,
      0n
    );
    const kinds = changesIn(await frames.next())
      .flatMap(({ kind }) => (kind.case === "chatLine" ? [kind.value] : []))
      .toSorted((a, b) => Number(a.seq - b.seq))
      .map(({ content, seq }) => [Number(seq), content?.kind.case]);
    expect(kinds).toStrictEqual([
      [1, "notice"],
      [2, "words"],
      [3, "words"],
      [4, "photos"],
      [5, "days"],
      [6, "poll"],
      [7, "unsent"],
      [8, "notice"],
    ]);
  });

  it("takes back the lines 0039's CHECK would refuse, so the group still opens", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { changesIn, pair, syncSocket } = await import("./sync-helpers");
    const { groupId, maker } = await pair();
    const head = 100;
    await runInDurableObject(
      env.GROUPS.getByName(groupId),
      async (_, state) => {
        const { sql } = state.storage;
        chatLinesBefore(sql, 37, [
          { seq: 1, text: "ことば" },
          { poll: true, replyTo: 1, seq: 2, text: "" },
          { days: [], pinnedAt: 9, poll: true, seq: 3, text: "" },
          { days: [], seq: 4, text: "" },
          { photos: [], seq: 5, text: "" },
          { photos: [PHOTO], seq: 6, text: "" },
          { notice: { kind: "joined" }, seq: 7 },
          { preview: PREVIEW, seq: 8, text: "ページつき" },
        ]);
        sql.exec("UPDATE chat_lines SET photos = '[{' WHERE seq = 6");
        sql.exec("UPDATE chat_lines SET notice = 'joined' WHERE seq = 7");
        sql.exec("UPDATE chat_lines SET preview = '{' WHERE seq = 8");
        sql.exec(
          "INSERT INTO chat_reactions (emoji, made_cursor, seq, thread_id, user_id) VALUES ('👍', 1, 3, 'group', 'u2')"
        );
        sql.exec("UPDATE log_head SET cursor = ?", head);
        await migrate(drizzle(state.storage), migrations);
        expect(sql.exec("SELECT * FROM chat_reactions").toArray()).toHaveLength(
          0
        );
      }
    );
    const { frames } = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      maker,
      BigInt(head)
    );
    const taken = changesIn(await frames.next()).flatMap(({ cursor, kind }) =>
      kind.case === "chatLine"
        ? [
            {
              case: kind.value.content?.kind.case,
              cursor: Number(cursor),
              pinned: kind.value.pinnedOrder,
              replyTo: kind.value.replyTo,
              seq: Number(kind.value.seq),
            },
          ]
        : []
    );
    expect(taken).toStrictEqual(
      [2, 3, 4, 5, 6, 7].map((seq, at) => ({
        case: "unsent",
        cursor: head + at + 1,
        pinned: 0n,
        replyTo: 0n,
        seq,
      }))
    );
  });

  it("picks out those lines by 0039's CHECK word for word", () => {
    const start = contentOnly.indexOf("CHECK(") + "CHECK(".length;
    const check = contentOnly.slice(
      start,
      contentOnly.indexOf("\n);", start) - 1
    );
    expect(fill.split(`NOT ${check}`)).toHaveLength(6);
  });
});
