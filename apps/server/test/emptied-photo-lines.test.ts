import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import unsendEmptied from "../src/group-do-migrations/0036_unsend-emptied-photo-lines.sql";
import {
  PAIR_ROSTER,
  changesIn,
  pair,
  sendFrame,
  syncSocket,
  untilAcked,
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
      (_, state) => {
        const { sql } = state.storage;
        // As 0035 left the lines that were photos: nothing in them.
        sql.exec(
          "update chat_lines set text = '' where thread_id = ? and seq in (2, 3)",
          threadId
        );
        sql.exec(
          "insert into chat_votes (day, made_cursor, seq, thread_id, user_id) values ('2026-10-05', 1, 2, ?, 'someone')",
          threadId
        );
        const before = sql
          .exec<{ cursor: number }>("select cursor from log_head")
          .one().cursor;
        sql.exec(unsendEmptied);
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
          value: { reactions: [], seq: 2n, text: "", unsent: true },
        },
      },
      {
        cursor: BigInt(head + 2),
        kind: { value: { seq: 3n, text: "", unsent: true } },
      },
    ]);

    const fresh = await syncSocket(path, maker);
    const lines = changesIn(await fresh.frames.next())
      .flatMap(({ kind }) => (kind.case === "chatLine" ? [kind.value] : []))
      .toSorted((a, b) => Number(a.seq - b.seq));
    expect(
      lines.map(({ seq, text, unsent, replyTo }) => ({
        replyTo,
        seq,
        text,
        unsent,
      }))
    ).toStrictEqual([
      { replyTo: 0n, seq: 1n, text: "", unsent: false },
      { replyTo: 0n, seq: 2n, text: "", unsent: true },
      { replyTo: 0n, seq: 3n, text: "", unsent: true },
      { replyTo: 0n, seq: 4n, text: "ことば", unsent: false },
      // A reply keeps its line, as it does when the line is taken back.
      { replyTo: 2n, seq: 5n, text: "いいね", unsent: false },
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
      { cursor: BigInt(head + 3), kind: { value: { seq: 6n, text: "つぎ" } } },
    ]);
  });
});
