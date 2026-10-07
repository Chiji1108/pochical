import { afterEach, describe, expect, it, vi } from "vitest";

import { call, userIdOf } from "./helpers";
import { pair, sendFrame, syncSocket } from "./sync-helpers";

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
        },
        groupId,
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
});
