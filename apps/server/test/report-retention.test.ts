import type { MessageInitShape } from "@bufbuild/protobuf";
import { createScheduledController } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatEditSchema } from "../src/gen/pochical/v1/sync_pb";
import worker from "../src/index";
import { call, signInAnonymously, userIdOf } from "./helpers";
import { pair, sendFrame, syncSocket, untilAcked } from "./sync-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
// What the deletion page promises: a year at most after the deletion.
const YEAR_MS = 365 * DAY_MS;

/** The group's reports Slack has been told of. */
const told = async (groupId: string) =>
  await env.DB.prepare(
    "select count(*) as n from reports where group_id = ? and slack_ts is not null"
  )
    .bind(groupId)
    .first<number>("n");

/** A third member of the pair's group, as their session token. */
const join = async (inviteCode: string): Promise<string> => {
  const token = await signInAnonymously();
  await call(
    "GroupService/JoinGroup",
    { displayName: "みお", inviteCode },
    token
  );
  return token;
};

const reportMember = async (groupId: string, by: string, userId: string) => {
  const answer = await call(
    "ChatService/Report",
    { groupId, reason: "REPORT_REASON_SPAM", userId },
    by
  );
  return answer.status;
};

const reportLine = async (groupId: string, by: string, seq: number) => {
  const answer = await call(
    "ChatService/Report",
    {
      groupId,
      line: { seq: String(seq), threadId: "group" },
      reason: "REPORT_REASON_SPAM",
    },
    by
  );
  return answer.status;
};

const deleteAccount = async (token: string) => {
  const answer = await call(
    "UserService/DeleteAccount",
    { appleAuthorizationCode: "" },
    token
  );
  return answer.status;
};

/** Who reported whom in the group, of the reports kept, in order. */
const kept = async (groupId: string): Promise<string[]> => {
  const rows = await env.DB.prepare(
    "select reporter_id, target_id from reports where group_id = ? order by reporter_id, target_id"
  )
    .bind(groupId)
    .all<{ reporter_id: string; target_id: string }>();
  return rows.results.map(
    ({ reporter_id, target_id }) => `${reporter_id}>${target_id}`
  );
};

/** The Worker's daily cron, run as if at `at`. */
const sweep = async (at: number): Promise<void> => {
  await worker.scheduled(
    createScheduledController({ cron: "0 18 * * *", scheduledTime: at }),
    env
  );
};

/** How Slack takes a post: whole, taken with its answer lost, or refused. */
type Posting = "taken" | "lost" | "refused";

/**
 * Pochical's people's Slack as the tests answer for it: each report posted
 * as `posting` says gets its own message, with its metadata, which the
 * channel's history gives back by when it was posted while `looking`;
 * and `deleting` answers chat.delete.
 */
const slack = ({
  deleting = () => ({ ok: true }),
  looking = () => true,
  posting = () => "taken",
}: {
  deleting?: () => Record<string, unknown>;
  looking?: () => boolean;
  posting?: () => Posting;
} = {}) => {
  const channel: { metadata: unknown; ts: string }[] = [];
  const posted: string[] = [];
  const deleted: string[] = [];
  let tries = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/conversations.history")) {
      if (!looking()) {
        return Response.json({ error: "ratelimited", ok: false });
      }
      const oldest = Number(url.searchParams.get("oldest") ?? "0");
      const latest = Number(url.searchParams.get("latest") ?? "Infinity");
      return Response.json({
        messages: channel.filter(
          ({ ts }) => Number(ts) >= oldest && Number(ts) <= latest
        ),
        ok: true,
      });
    }
    const body: unknown = await request.json();
    const args = typeof body === "object" && body !== null ? body : {};
    if (url.pathname.endsWith("/chat.delete")) {
      const ts = "ts" in args ? String(args.ts) : "";
      const answer = deleting();
      if (answer.ok === true) {
        const at = channel.findIndex((message) => message.ts === ts);
        if (at === -1) {
          return Response.json({ error: "message_not_found", ok: false });
        }
        channel.splice(at, 1);
        deleted.push(ts);
      }
      return Response.json(answer);
    }
    tries += 1;
    const how = posting();
    if (how === "refused") {
      return Response.json({ error: "not_in_channel", ok: false });
    }
    const ts = `${Math.floor(Date.now() / 1000)}.${String(tries).padStart(6, "0")}`;
    channel.push({ metadata: "metadata" in args ? args.metadata : null, ts });
    posted.push(ts);
    if (how === "lost") {
      throw new TypeError("Network connection lost.");
    }
    return Response.json({ ok: true, ts });
  });
  return { channel, deleted, posted, tries: () => tries };
};

describe("reports after an account is deleted", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("erases those by and about the account a year on, with their Slack posts, and keeps the rest", async () => {
    const { groupId, guest, inviteCode, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const third = await join(inviteCode);
    const thirdId = await userIdOf(third);
    const { deleted, posted } = slack();
    expect([
      await reportMember(groupId, guest, makerId),
      await reportMember(groupId, maker, guestId),
      await reportMember(groupId, third, makerId),
    ]).toStrictEqual([200, 200, 200]);
    await vi.waitFor(async () => {
      await expect(told(groupId)).resolves.toBe(3);
    });
    const before = Date.now();
    await expect(deleteAccount(guest)).resolves.toBe(200);
    const after = Date.now();
    const seen = async () => ({
      deleted: deleted.toSorted(),
      kept: await kept(groupId),
    });
    const all = await kept(groupId);
    const rest = [`${thirdId}>${makerId}`];

    // The day's sweep a day short of the year keeps them all; the last
    // before the year is up erases those naming the account, Slack's posts
    // with them; run again, nothing more goes.
    await sweep(before + YEAR_MS - 2 * DAY_MS);
    const early = await seen();
    await sweep(after + YEAR_MS - DAY_MS);
    const due = await seen();
    await sweep(after + YEAR_MS);
    const again = await seen();
    expect({ again, due, early }).toStrictEqual({
      again: due,
      due: { deleted: posted.slice(0, 2).toSorted(), kept: rest },
      early: { deleted: [], kept: all },
    });
    expect(all).toHaveLength(3);
  });

  it("keeps a report until Slack deletes its post", async () => {
    const { groupId, guest, makerId } = await pair();
    let slackBusy = true;
    const { deleted, posted } = slack({
      deleting: () =>
        slackBusy ? { error: "ratelimited", ok: false } : { ok: true },
    });
    await expect(reportMember(groupId, guest, makerId)).resolves.toBe(200);
    await vi.waitFor(async () => {
      await expect(told(groupId)).resolves.toBe(1);
    });
    const id = await env.DB.prepare("select id from reports where group_id = ?")
      .bind(groupId)
      .first<string>("id");
    await exports.AdminEntrypoint.handleReport(
      String(id),
      "acted",
      "本人に注意した",
      "staff@pochical.app"
    );
    await expect(deleteAccount(guest)).resolves.toBe(200);
    const due = Date.now() + YEAR_MS;

    await sweep(due);
    await expect(kept(groupId)).resolves.toHaveLength(1);

    slackBusy = false;
    await sweep(due + DAY_MS);
    const notes = await env.DB.prepare(
      "select count(*) as n from admin_actions where target = ?"
    )
      .bind(id)
      .first<number>("n");
    expect([await kept(groupId), deleted, notes]).toStrictEqual([
      [],
      posted,
      0,
    ]);
  });

  it("keeps the reports of an account whose deletion stopped before its sign-ins went", async () => {
    const { groupId, guest, makerId } = await pair();
    const guestId = await userIdOf(guest);
    slack();
    await expect(reportMember(groupId, guest, makerId)).resolves.toBe(200);
    // As a deletion cut off after the note leaves it, the account still here.
    await env.DB.prepare(
      "insert into deleted_accounts (user_id, deleted_at) values (?, ?)"
    )
      .bind(guestId, Date.now())
      .run();
    await sweep(Date.now() + YEAR_MS);
    await expect(kept(groupId)).resolves.toHaveLength(1);
  });

  it("finds a post whose answer was lost before erasing its report, and erases one Slack refused", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const answers: Posting[] = ["lost", "refused"];
    let slackLooks = false;
    const { channel, deleted, posted, tries } = slack({
      looking: () => slackLooks,
      posting: () => answers.shift() ?? "taken",
    });
    expect([
      await reportMember(groupId, guest, makerId),
      await reportMember(groupId, maker, guestId),
    ]).toStrictEqual([200, 200]);
    await vi.waitFor(() => {
      expect(tries()).toBe(2);
    });
    await expect(deleteAccount(guest)).resolves.toBe(200);
    const due = Date.now() + YEAR_MS;

    // Neither report knows its message; while Slack's history cannot be
    // read, both wait, as either may be there.
    await sweep(due);
    const waiting = await kept(groupId);
    expect({ kept: waiting.length, told: await told(groupId) }).toStrictEqual({
      kept: 2,
      told: 0,
    });

    slackLooks = true;
    await sweep(due + DAY_MS);
    expect({
      channel,
      deleted,
      kept: await kept(groupId),
      posted: posted.length,
    }).toStrictEqual({ channel: [], deleted: posted, kept: [], posted: 1 });
  });

  it("takes no report of a line taken back, or of the app's notice", async () => {
    const { groupId, guest, maker } = await pair();
    const { frames, socket } = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      maker
    );
    const edit = (kind: MessageInitShape<typeof ChatEditSchema>["kind"]) => {
      sendFrame(socket, {
        case: "chatEdits",
        value: { edits: [{ kind, opId: crypto.randomUUID() }] },
      });
    };
    edit({
      case: "send",
      value: {
        content: { kind: { case: "words", value: { text: "まちがい" } } },
        threadId: "group",
      },
    });
    await untilAcked(frames);
    slack();
    // The line, then the join's notice before it.
    await expect(reportLine(groupId, guest, 2)).resolves.toBe(200);
    await expect(reportLine(groupId, guest, 1)).resolves.toBe(404);
    edit({ case: "unsend", value: { seq: 2n, threadId: "group" } });
    await untilAcked(frames);
    socket.close();
    await expect(reportLine(groupId, guest, 2)).resolves.toBe(404);
  });
});
