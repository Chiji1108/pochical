import { afterEach, describe, expect, it, vi } from "vitest";

import { call, userIdOf } from "./helpers";
import { changesIn, device, pair, sendFrame, syncSocket } from "./sync-helpers";

// An APNs token as a device gives it.
const TOKEN = "a1".repeat(32);

const say = (socket: WebSocket, opId: string, text: string): void => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: [
        { kind: { case: "send", value: { text, threadId: "group" } }, opId },
      ],
    },
  });
};

/** What reached APNs, as each request's address and body. */
const apnsCalls = () => {
  const calls: { url: string; body: unknown; authorization: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      authorization: request.headers.get("authorization") ?? "",
      body: await request.json(),
      url: request.url,
    });
    return new Response(null, { status: calls.length > 1 ? 410 : 200 });
  });
  return calls;
};

const read = (socket: WebSocket, opId: string, lastReadSeq: number): void => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: [
        {
          kind: {
            case: "read",
            value: { lastReadSeq: BigInt(lastReadSeq), threadId: "group" },
          },
          opId,
        },
      ],
    },
  });
};

/** What reached APNs, each taken, with the push's type and priority. */
const apnsTaking = () => {
  const calls: { body: unknown; priority: string; type: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      body: await request.json(),
      priority: request.headers.get("apns-priority") ?? "",
      type: request.headers.get("apns-push-type") ?? "",
    });
    return new Response(null, { status: 200 });
  });
  return calls;
};

describe("a chat's notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tell the others' devices of a new line, worded by the app, with the badge", async () => {
    const { groupId, guest, maker } = await pair();
    await call(
      "UserService/RegisterPushToken",
      { sandbox: true, token: TOKEN },
      guest
    );
    const calls = apnsCalls();
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "<@nobody>今週どう？");
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toMatchObject({
      body: {
        aps: {
          alert: {
            "loc-args": ["さくら", "@メンバー今週どう？"],
            "loc-key": "CHAT_GROUP_TEXT",
            "title-loc-args": ["いとこ会"],
            "title-loc-key": "CHAT_TITLE",
          },
          badge: 1,
          // Through the app's extension, for the writer's face, and
          // answered from.
          category: "CHAT_LINE",
          "mutable-content": 1,
        },
        authorId: await userIdOf(maker),
        groupId,
        // After the line saying the guest joined.
        seq: 2,
        threadId: "group",
      },
      url: `https://api.sandbox.push.apple.com/3/device/${TOKEN}`,
    });
    expect(calls[0]?.authorization.startsWith("bearer ")).toBeTruthy();

    // APNs says the token is gone (410): it is dropped, and the next line
    // reaches nothing.
    say(mine.socket, "b", "まだ？");
    await expect.poll(() => calls.length).toBe(2);
    say(mine.socket, "c", "おーい");
    await mine.frames.next();
    // Time for a notification that should not come.
    await scheduler.wait(100);
    expect(calls).toHaveLength(2);
  });

  it("are not sent from someone the reader blocked", async () => {
    const { groupId, guest, maker } = await pair();
    await call(
      "UserService/RegisterPushToken",
      { sandbox: true, token: TOKEN },
      guest
    );
    await call(
      "UserService/SetBlocked",
      { blocked: true, userId: await userIdOf(maker) },
      guest
    );
    const calls = apnsCalls();
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "見て");
    await mine.frames.next();
    // Time for a notification that should not come.
    await scheduler.wait(100);
    expect(calls).toHaveLength(0);
  });

  it("are not sent from a chat turned off, but for a mention while mentions notify", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    await call(
      "UserService/RegisterPushToken",
      { sandbox: true, token: TOKEN },
      guest
    );
    const muted = await call(
      "UserService/SetChatMuted",
      { groupId, muted: true, threadId: "group" },
      guest
    );
    expect(muted.status).toBe(200);
    const calls = apnsCalls();
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "誰か見てる？");
    await mine.frames.next();
    say(mine.socket, "b", `<@${guestId}> 見て`);
    await expect.poll(() => calls.length).toBe(1);
    // The badge counts the mention alone.
    expect(calls[0]?.body).toMatchObject({
      aps: { alert: { "loc-args": ["さくら", "@ゆうき 見て"] }, badge: 1 },
    });

    // With メンションはいつも通知 off, not even a mention.
    await call(
      "UserService/SetChatNotifications",
      { mentionsWhenMuted: false },
      guest
    );
    say(mine.socket, "c", `<@${guestId}> まだ？`);
    await mine.frames.next();
    // Time for a notification that should not come.
    await scheduler.wait(100);
    expect(calls).toHaveLength(1);
  });

  it("tell the user's devices whose chats are off, and how many mentions wait", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    await call(
      "UserService/SetChatMuted",
      { groupId, muted: true, threadId: "group" },
      guest
    );
    const phone = await device(guest);
    const caughtUp = changesIn(await phone.frames.next()).filter(
      ({ kind }) => kind.case === "chatMute"
    );
    expect(caughtUp).toMatchObject([
      { kind: { value: { groupId, muted: true, threadId: "group" } } },
    ]);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", `<@${guestId}> 見て`);
    expect(changesIn(await phone.frames.next())).toMatchObject([
      { kind: { case: "unreadCount", value: { count: 1, mentions: 1 } } },
    ]);

    // Not a chat of theirs, or not their group.
    const strangers = await call(
      "UserService/SetChatMuted",
      { groupId, muted: true, threadId: "direct:x:y" },
      guest
    );
    const elsewhere = await call(
      "UserService/SetChatMuted",
      { groupId: "nowhere", muted: true, threadId: "group" },
      guest
    );
    expect([strangers.status, elsewhere.status]).toStrictEqual([404, 404]);
  });

  it("are taken back from the reader's devices once a read reaches them", async () => {
    const { groupId, guest, maker } = await pair();
    await call(
      "UserService/RegisterPushToken",
      { sandbox: true, token: TOKEN },
      guest
    );
    const calls = apnsTaking();
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    const theirs = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    say(mine.socket, "a", "今週どう？");
    say(mine.socket, "b", "土曜とか");
    await expect.poll(() => calls.length).toBe(2);

    // After the line saying the guest joined.
    const [first, second] = [2, 3];
    expect(calls.map(({ body }) => body)).toMatchObject([
      { seq: first },
      { seq: second },
    ]);
    // Read up to the first: it is taken back, the second waits.
    read(theirs.socket, "r1", first);
    await expect.poll(() => calls.length).toBe(3);
    expect(calls[2]).toStrictEqual({
      body: {
        aps: { "content-available": 1 },
        withdraw: { groupId, readTo: first, threadId: "group" },
      },
      priority: "5",
      type: "background",
    });
    read(theirs.socket, "r2", second);
    await expect.poll(() => calls.length).toBe(4);
    expect(calls[3]?.body).toMatchObject({ withdraw: { readTo: second } });

    // Nothing notified is left to take back: a read sends nothing.
    say(mine.socket, "c", "あ、日曜でも");
    await expect.poll(() => calls.length).toBe(5);
    await call(
      "UserService/SetChatMuted",
      { groupId, muted: true, threadId: "group" },
      guest
    );
    say(mine.socket, "d", "どっちがいい？");
    read(theirs.socket, "r3", second + 1);
    await expect.poll(() => calls.length).toBe(6);
    expect(calls[5]?.body).toMatchObject({ withdraw: { readTo: second + 1 } });
    read(theirs.socket, "r4", second + 2);
    await theirs.frames.next();
    // Time for a withdrawal that should not come: its line was not notified.
    await scheduler.wait(100);
    expect(calls).toHaveLength(6);
  });
});
