import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { describe, expect, it } from "vitest";

import { wordsOf } from "../src/group-chat";
import migrations from "../src/group-do-migrations/migrations.js";
import { chatLinesBefore } from "./old-chat-lines";
import {
  PAIR_ROSTER,
  changesIn,
  holding,
  pair,
  sendFrame,
  syncSocket,
  untilAcked,
  words,
} from "./sync-helpers";

const threadId = "group";

describe("a Group DO with lines that were photos before 0035", () => {
  it("takes each back as 送信取消 does, at a cursor past the head", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, guest, maker } = await pair();
    const path = `/v1/groups/${groupId}/socket`;
    const mine = await syncSocket(path, maker, PAIR_ROSTER);
    const theirs = await syncSocket(path, guest, PAIR_ROSTER);
    // pair()'s chat starts with a notice at seq 1: two photos' lines are
    // at seqs 2 and 3, words at 4, and the reply at 5.
    sendFrame(mine.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: { case: "send", value: { text: "写真", threadId } },
            opId: "a",
          },
          {
            kind: { case: "send", value: { text: "写真2", threadId } },
            opId: "a2",
          },
          {
            kind: { case: "send", value: { text: "ことば", threadId } },
            opId: "b",
          },
        ],
      },
    });
    await untilAcked(mine.frames);
    sendFrame(theirs.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "react",
              value: { emoji: "👍", on: true, seq: 2n, threadId },
            },
            opId: "r",
          },
          {
            kind: {
              case: "send",
              value: { replyTo: 2n, text: "いいね", threadId },
            },
            opId: "c",
          },
        ],
      },
    });
    await untilAcked(theirs.frames);

    const { head, votes } = await runInDurableObject(
      env.GROUPS.getByName(groupId),
      async (_, state) => {
        const { sql } = state.storage;
        // The lines as 0035 left them, those that were photos with
        // nothing in them.
        const lines = sql
          .exec<{
            author_id: string;
            cursor: number;
            notice_kind: string | null;
            op_id: string;
            reply_to: number | null;
            sent_at: number;
            seq: number;
            text: string | null;
          }>(
            `select author_id, cursor, content ->> '$.notice.kind' as notice_kind, op_id,
              reply_to, sent_at, seq, content ->> '$.text' as text
            from chat_lines where thread_id = ?`,
            threadId
          )
          .toArray()
          .map((line) => ({
            authorId: line.author_id,
            cursor: line.cursor,
            notice:
              line.notice_kind === null
                ? undefined
                : { kind: line.notice_kind },
            opId: line.op_id,
            replyTo: line.reply_to ?? undefined,
            sentAt: line.sent_at,
            seq: line.seq,
            text: line.seq === 2 || line.seq === 3 ? "" : (line.text ?? ""),
          }));
        chatLinesBefore(sql, 36, lines);
        sql.exec(
          "insert into chat_votes (day, made_cursor, seq, thread_id, user_id) values ('2026-10-05', 1, 2, ?, 'someone')",
          threadId
        );
        const before = sql
          .exec<{ cursor: number }>("select cursor from log_head")
          .one().cursor;
        await migrate(drizzle(state.storage), migrations);
        return {
          head: before,
          votes: sql.exec("select * from chat_votes").toArray().length,
        };
      }
    );
    expect(votes).toBe(0);

    const later = await syncSocket(path, guest, BigInt(head));
    const takenBack = changesIn(await later.frames.next());
    expect(takenBack).toHaveLength(2);
    expect(takenBack).toMatchObject([
      {
        cursor: BigInt(head + 1),
        kind: {
          value: { reactions: [], seq: 2n, ...holding("unsent") },
        },
      },
      {
        cursor: BigInt(head + 2),
        kind: { value: { seq: 3n, ...holding("unsent") } },
      },
    ]);

    const fresh = await syncSocket(path, maker);
    const lines = changesIn(await fresh.frames.next())
      .flatMap(({ kind }) => (kind.case === "chatLine" ? [kind.value] : []))
      .toSorted((a, b) => Number(a.seq - b.seq));
    expect(
      lines.map((line) => ({
        kind: line.content?.kind.case,
        replyTo: line.replyTo,
        seq: line.seq,
        text: wordsOf(line),
      }))
    ).toStrictEqual([
      { kind: "notice", replyTo: 0n, seq: 1n, text: "" },
      { kind: "unsent", replyTo: 0n, seq: 2n, text: "" },
      { kind: "unsent", replyTo: 0n, seq: 3n, text: "" },
      { kind: "words", replyTo: 0n, seq: 4n, text: "ことば" },
      // A reply keeps its line, as it does when the line is taken back.
      { kind: "words", replyTo: 2n, seq: 5n, text: "いいね" },
    ]);

    // The next line takes the next cursor and seq.
    sendFrame(later.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: { case: "send", value: { text: "つぎ", threadId } },
            opId: "d",
          },
        ],
      },
    });
    expect(changesIn(await later.frames.next())).toMatchObject([
      {
        cursor: BigInt(head + 3),
        kind: { value: { seq: 6n, ...words("つぎ") } },
      },
    ]);
  });
});
