import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { call, ORIGIN, userIdOf } from "./helpers";
import { providerKeys, idToken, link } from "./provider-helpers";
import { changesIn, device, pair, sendFrame, syncSocket } from "./sync-helpers";

// An APNs token as a device gives it.
const TOKEN = "a1".repeat(32);
// Another device's.
const OTHER_TOKEN = "c3".repeat(32);

const say = (socket: WebSocket, opId: string, text: string): void => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: [
        {
          kind: {
            case: "send",
            value: {
              content: { kind: { case: "words", value: { text } } },
              threadId: "group",
            },
          },
          opId,
        },
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
      { platform: "PUSH_PLATFORM_APNS", sandbox: true, token: TOKEN },
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
        // Whom it is for, which the device checks against who is signed in.
        recipientId: await userIdOf(guest),
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
      { platform: "PUSH_PLATFORM_APNS", sandbox: true, token: TOKEN },
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
      { platform: "PUSH_PLATFORM_APNS", sandbox: true, token: TOKEN },
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
      { platform: "PUSH_PLATFORM_APNS", sandbox: true, token: TOKEN },
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

/** A second session of the user, as signing in with Apple on another device. */
const secondSession = async (token: string, subject: string) => {
  providerKeys();
  await expect(
    link(token, "apple", await idToken("apple", subject, "p1"), "p1")
  ).resolves.toBe(200);
  const signedIn = await exports.default.fetch(
    `${ORIGIN}/api/auth/sign-in/social`,
    {
      body: JSON.stringify({
        idToken: { nonce: "p2", token: await idToken("apple", subject, "p2") },
        provider: "apple",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  vi.restoreAllMocks();
  const second = signedIn.headers.get("set-auth-token") ?? "";
  await expect(userIdOf(second)).resolves.toBe(await userIdOf(token));
  return second;
};

const signOut = async (token: string): Promise<void> => {
  const response = await exports.default.fetch(`${ORIGIN}/api/auth/sign-out`, {
    body: "{}",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(response.status).toBe(200);
};

const registerToken = async (token: string, session: string) => {
  const response = await call(
    "UserService/RegisterPushToken",
    { platform: "PUSH_PLATFORM_APNS", sandbox: true, token },
    session
  );
  expect(response.status).toBe(200);
};

/** The device each notification went to, by its token. */
const reached = (calls: { url: string }[]): string[] =>
  calls.map(({ url }) => url.slice(url.lastIndexOf("/") + 1));

describe("a device's push token", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("goes with the session it was registered under, the user's other sessions keeping theirs", async () => {
    const { groupId, guest, maker } = await pair();
    const otherDevice = await secondSession(guest, "apple-push1");
    await registerToken(TOKEN, guest);
    await registerToken(OTHER_TOKEN, otherDevice);
    await signOut(guest);

    const calls = apnsCalls();
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "今週どう？");
    await expect.poll(() => calls.length).toBe(1);
    // Time for a notification to the signed-out device that should not come.
    await scheduler.wait(100);
    expect(reached(calls)).toStrictEqual([OTHER_TOKEN]);
    // Nor is the signed-out device's token kept.
    const kept = await env.DB.prepare(
      "select token from push_tokens where token in (?, ?)"
    )
      .bind(TOKEN, OTHER_TOKEN)
      .all<{ token: string }>();
    expect(kept.results).toStrictEqual([{ token: OTHER_TOKEN }]);
  });

  it("is one user's at a time: registered by another, the user before hears nothing at it", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(TOKEN, guest);
    // The device goes on as the maker.
    await registerToken(TOKEN, maker);

    const calls = apnsCalls();
    const makers = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(makers.socket, "a", "ゆうきさんへ");
    await makers.frames.next();
    // Time for a notification to the guest that should not come.
    await scheduler.wait(100);
    expect(calls).toHaveLength(0);

    const guests = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    say(guests.socket, "b", "さくらさんへ");
    await expect.poll(() => calls.length).toBe(1);
    expect(reached(calls)).toStrictEqual([TOKEN]);
    expect(calls[0]?.body).toMatchObject({
      recipientId: await userIdOf(maker),
    });
  });

  it("is dropped when APNs says it is dead, kept when APNs fails, and each refusal logged and counted", async () => {
    const { groupId, guest, maker } = await pair();
    const otherDevice = await secondSession(guest, "apple-push2");
    await registerToken(TOKEN, guest);
    await registerToken(OTHER_TOKEN, otherDevice);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const { url } = new Request(input);
      return await Promise.resolve(
        url.endsWith(TOKEN)
          ? Response.json({ reason: "BadDeviceToken" }, { status: 400 })
          : Response.json({ reason: "InternalServerError" }, { status: 500 })
      );
    });
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const counted = vi.spyOn(env.PUSH_OUTCOMES, "writeDataPoint");

    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "今週どう？");
    await expect.poll(() => warned.mock.calls.length).toBe(2);
    expect(warned).toHaveBeenCalledWith({
      push: {
        kind: "alert",
        platform: "apns",
        reason: "BadDeviceToken",
        sandbox: true,
        sent: "gone",
        status: 400,
      },
    });
    expect(warned).toHaveBeenCalledWith({
      push: {
        kind: "alert",
        platform: "apns",
        reason: "InternalServerError",
        sandbox: true,
        sent: "failed",
        status: 500,
      },
    });
    expect(counted.mock.calls.map(([point]) => point?.indexes)).toStrictEqual(
      expect.arrayContaining([["gone"], ["failed"]])
    );

    await expect
      .poll(async () => {
        const kept = await env.DB.prepare(
          "select token from push_tokens where token in (?, ?)"
        )
          .bind(TOKEN, OTHER_TOKEN)
          .all<{ token: string }>();
        return kept.results;
      })
      .toStrictEqual([{ token: OTHER_TOKEN }]);
  });

  it("is kept when APNs cannot be reached, and left out of what is logged and counted", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(TOKEN, guest);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const { url } = new Request(input);
      return await Promise.reject(new TypeError(`fetch to ${url} failed`));
    });
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const counted = vi.spyOn(env.PUSH_OUTCOMES, "writeDataPoint");

    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "今週どう？");
    await expect.poll(() => warned.mock.calls.length).toBe(1);
    expect(warned).toHaveBeenCalledWith({
      push: {
        kind: "alert",
        platform: "apns",
        reason:
          "TypeError: fetch to https://api.sandbox.push.apple.com/3/device/{token} failed",
        sandbox: true,
        sent: "failed",
        status: 0,
      },
    });
    expect(JSON.stringify(counted.mock.calls)).not.toContain(TOKEN);
    const kept = await env.DB.prepare(
      "select token from push_tokens where token = ?"
    )
      .bind(TOKEN)
      .all<{ token: string }>();
    expect(kept.results).toStrictEqual([{ token: TOKEN }]);
  });
});

// An FCM registration token as an Android phone gives it.
const FCM_TOKEN = `fcm-phone:APA91b${"x".repeat(140)}`;

/** What reached Google: the OAuth grants asked for, and FCM's sends. */
const googleCalls = (answer: (send: number) => Response) => {
  const grants: FormData[] = [];
  const sends: { authorization: string; body: unknown; url: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === "https://oauth2.googleapis.com/token") {
      grants.push(await request.formData());
      return Response.json({
        access_token: `ya29.test-${grants.length}`,
        expires_in: 3599,
        token_type: "Bearer",
      });
    }
    sends.push({
      authorization: request.headers.get("authorization") ?? "",
      body: await request.json(),
      url: request.url,
    });
    return answer(sends.length);
  });
  return { grants, sends };
};

const base64urlBytes = (part: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(part.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.codePointAt(0) ?? 0
  );

/** The claims of a JWT FCM_SERVICE_ACCOUNT signed, once its signature is checked. */
const signedClaims = async (jwt: string): Promise<unknown> => {
  const [header = "", body = "", signature = ""] = jwt.split(".");
  const pem = env.FCM_TEST_PUBLIC_KEY.replaceAll(/-----[^-]+-----|\s/gu, "");
  const key = await crypto.subtle.importKey(
    "spki",
    base64urlBytes(pem),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64urlBytes(signature),
    new TextEncoder().encode(`${header}.${body}`)
  );
  expect(valid).toBeTruthy();
  const decoded = (part: string): unknown =>
    JSON.parse(new TextDecoder().decode(base64urlBytes(part)));
  expect(decoded(header)).toStrictEqual({ alg: "RS256", kid: "fcm-test-key" });
  return decoded(body);
};

/** The JWT an OAuth grant was asked with, as a JWT bearer grant. */
const assertionOf = (grant: FormData | undefined): string => {
  expect(grant?.get("grant_type")).toBe(
    "urn:ietf:params:oauth:grant-type:jwt-bearer"
  );
  const assertion = grant?.get("assertion");
  return typeof assertion === "string" ? assertion : "";
};

const registerFcm = async (session: string) => {
  const response = await call(
    "UserService/RegisterPushToken",
    { platform: "PUSH_PLATFORM_FCM", token: FCM_TOKEN },
    session
  );
  expect(response.status).toBe(200);
};

/** The data of an FCM message's body. */
const dataOf = (body: unknown): Record<string, string> => {
  const data: unknown =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "object" &&
    body.message !== null &&
    "data" in body.message
      ? body.message.data
      : undefined;
  expect(data).toBeTypeOf("object");
  return Object.fromEntries(Object.entries(data ?? {}));
};

describe("an Android phone's notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("go through FCM as data the app words, at high priority", async () => {
    const { groupId, guest, maker } = await pair();
    await registerFcm(guest);
    const { sends } = googleCalls(() => Response.json({ name: "sent" }));
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "今週どう？");
    await expect.poll(() => sends.length).toBe(1);
    expect(sends[0]).toMatchObject({
      body: {
        message: { android: { priority: "HIGH" }, token: FCM_TOKEN },
      },
      url: "https://fcm.googleapis.com/v1/projects/pochical-test/messages:send",
    });
    const data = dataOf(sends[0]?.body);
    expect(Object.keys(data)).toStrictEqual(["alert"]);
    expect(JSON.parse(data.alert ?? "")).toStrictEqual({
      badge: 1,
      body: { args: ["さくら", "今週どう？"], key: "CHAT_GROUP_TEXT" },
      groupId,
      // After the line saying the guest joined.
      line: { authorId: await userIdOf(maker), seq: 2 },
      recipientId: await userIdOf(guest),
      threadId: "group",
      title: { args: ["いとこ会"], key: "CHAT_TITLE" },
    });
  });

  it("take an access token Google gives for the service account's JWT, kept until FCM refuses it", async () => {
    const { groupId, guest, maker } = await pair();
    await registerFcm(guest);
    // FCM refuses the first access token, as it would one revoked: the
    // next pushes, sent at once, ask for one new one and share it.
    const { grants, sends } = googleCalls((send) =>
      send === 1
        ? Response.json(
            { error: { code: 401, status: "UNAUTHENTICATED" } },
            { status: 401 }
          )
        : Response.json({ name: "sent" })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", "今週どう？");
    await expect.poll(() => sends.length).toBe(1);
    const granted = grants.length;
    say(mine.socket, "b", "土曜とか");
    say(mine.socket, "c", "日曜でも");
    await expect.poll(() => sends.length).toBe(3);
    expect(grants).toHaveLength(granted + 1);
    await expect(
      signedClaims(assertionOf(grants.at(-1)))
    ).resolves.toMatchObject({
      aud: "https://oauth2.googleapis.com/token",
      iss: "fcm@pochical-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    });
    const bearer = `Bearer ya29.test-${grants.length}`;
    expect(
      sends.slice(1).map(({ authorization }) => authorization)
    ).toStrictEqual([bearer, bearer]);
  });

  it("are taken back through FCM at normal priority once read", async () => {
    const { groupId, guest, maker } = await pair();
    await registerFcm(guest);
    const { sends } = googleCalls(() => Response.json({ name: "sent" }));
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    const theirs = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    say(mine.socket, "a", "今週どう？");
    await expect.poll(() => sends.length).toBe(1);
    read(theirs.socket, "r1", 2);
    await expect.poll(() => sends.length).toBe(2);
    expect(sends[1]?.body).toStrictEqual({
      message: {
        android: { priority: "NORMAL" },
        data: {
          withdraw: JSON.stringify({ groupId, readTo: 2, threadId: "group" }),
        },
        token: FCM_TOKEN,
      },
    });
  });

  // FCM's refusals as it words them: its FcmError's code, and for a field
  // it found wrong a BadRequest naming it.
  it.each([
    [404, "UNREGISTERED", "", "gone"],
    [403, "SENDER_ID_MISMATCH", "", "gone"],
    [400, "INVALID_ARGUMENT", "message.token", "gone"],
    // The message's own fault, not the token's.
    [400, "INVALID_ARGUMENT", "message.data[0].value", "failed"],
    [400, "INVALID_ARGUMENT", "", "failed"],
    [500, "INTERNAL", "", "failed"],
  ] as const)(
    "on %i %s (%s), mark the token %s, dropping it only when it is no longer the app's",
    async (status, errorCode, field, sent) => {
      const { groupId, guest, maker } = await pair();
      await registerFcm(guest);
      const { sends } = googleCalls(() =>
        Response.json(
          {
            error: {
              code: status,
              details: [
                {
                  "@type":
                    "type.googleapis.com/google.firebase.fcm.v1.FcmError",
                  errorCode,
                },
                ...(field === ""
                  ? []
                  : [
                      {
                        "@type": "type.googleapis.com/google.rpc.BadRequest",
                        fieldViolations: [{ description: "wrong", field }],
                      },
                    ]),
              ],
              status: errorCode,
            },
          },
          { status }
        )
      );
      const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
      const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
      say(mine.socket, "a", "今週どう？");
      await expect.poll(() => sends.length).toBe(1);
      await expect.poll(() => warned.mock.calls.length).toBe(1);
      expect(warned).toHaveBeenCalledWith({
        push: {
          kind: "alert",
          platform: "fcm",
          reason: errorCode,
          sandbox: false,
          sent,
          status,
        },
      });
      await expect
        .poll(async () => {
          const rows = await env.DB.prepare(
            "select token from push_tokens where token = ?"
          )
            .bind(FCM_TOKEN)
            .all<{ token: string }>();
          return rows.results.length;
        })
        .toBe(sent === "gone" ? 0 : 1);
    }
  );

  it("take only a token of its platform's shape", async () => {
    const { guest } = await pair();
    const refused = [
      // No platform.
      { token: FCM_TOKEN },
      // FCM has no sandbox.
      { platform: "PUSH_PLATFORM_FCM", sandbox: true, token: FCM_TOKEN },
      // Not an FCM token.
      { platform: "PUSH_PLATFORM_FCM", token: "no spaces in a token" },
      // An FCM token is not APNs'.
      { platform: "PUSH_PLATFORM_APNS", token: FCM_TOKEN },
    ];
    const statuses = await Promise.all(
      refused.map(async (body) => {
        const response = await call(
          "UserService/RegisterPushToken",
          body,
          guest
        );
        return response.status;
      })
    );
    expect(statuses).toStrictEqual([400, 400, 400, 400]);
  });
});

/** A group chat line's words, the second argument at `path` in the JSON. */
const wordsIn = (json: string | undefined, ...path: string[]): string => {
  let at: unknown = JSON.parse(json ?? "null");
  for (const key of path) {
    at =
      typeof at === "object" && at !== null
        ? Object.entries(at).find(([name]) => name === key)?.[1]
        : undefined;
  }
  return Array.isArray(at) ? String(at[1]) : "";
};

const byteCount = (text: string): number =>
  new TextEncoder().encode(text).length;

// One character of 25 bytes.
const FAMILY = "👨‍👩‍👧‍👦";

/** How many whole FAMILY the words are, -1 when they are anything else. */
const familiesIn = (words: string): number =>
  words.replaceAll(FAMILY, "") === "" ? words.length / FAMILY.length : -1;

describe("a notification's size", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fits what APNs and FCM take, its words cut between characters", async () => {
    const { groupId, guest, maker } = await pair();
    const phone = await secondSession(guest, "apple-push-size");
    await registerToken(TOKEN, guest);
    await registerFcm(phone);
    // What each service was sent: APNs' payload, FCM's data.
    const sent: { apns?: string; fcm?: Record<string, string> } = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "ya29.size", expires_in: 3599 });
      }
      if (request.url.startsWith("https://fcm.googleapis.com/")) {
        sent.fcm = dataOf(await request.json());
      } else {
        sent.apns = await request.text();
      }
      return Response.json({});
    });
    // 200 characters, as many as a notification carries: 5000 bytes.
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    say(mine.socket, "a", FAMILY.repeat(200));
    await expect
      .poll(() => sent.apns !== undefined && sent.fcm !== undefined)
      .toBeTruthy();

    const fcm = Object.entries(sent.fcm ?? {})
      .flat()
      .join("");
    expect([byteCount(sent.apns ?? ""), byteCount(fcm)]).toStrictEqual([
      expect.toSatisfy((size: number) => size <= 4096),
      expect.toSatisfy((size: number) => size <= 4096),
    ]);
    // Cut no more than it must be, and between whole emoji.
    const cuts = [
      familiesIn(wordsIn(sent.apns, "aps", "alert", "loc-args")),
      familiesIn(wordsIn(sent.fcm?.alert, "body", "args")),
    ];
    expect(cuts.every((count) => count > 100 && count < 200)).toBeTruthy();
  });
});
