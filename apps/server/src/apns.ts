// Notifications sent to the user's iPhones through Apple's push service
// (APNs), with a token-based key: a JWT signed with the team's .p8 key
// (ES256), kept and reused for 50 minutes as Apple asks. APNs speaks only
// HTTP/2, which a deployed Worker's fetch is upgraded to by Cloudflare;
// `wrangler dev` cannot reach it, so a local server sends nothing.

import { signES256 } from "./es256";

/** The app's bundle id, the topic every notification is for. */
const TOPIC = "app.pochical";

/** How long a signed token is reused: under Apple's hour. */
const TOKEN_MS = 50 * 60 * 1000;

/** Words an app puts together itself, from a key in its strings and the arguments. */
export type Localized = { key: string; args: string[] };

/** A notification as the app words it (spec/sync-protocol.md, Push). */
export type Alert = {
  title: Localized;
  body: Localized;
  // Which chat it opens, and groups it with the chat's others: a group's,
  // or with no group the chat with Pochical's people.
  groupId: string;
  threadId: string;
  // The line: who wrote it, for their face, and where it is, for the
  // device to take the notification back once it is read. None for an
  // answer from Pochical's people.
  line?: { authorId: string; seq: number };
  // Notifications with the same one show as one, the latest in place of
  // those before (apns-collapse-id): an album's photos.
  collapseId?: string;
};

/**
 * Whom a notification is sent to: the user, whose device shows it only
 * while signed in as them, and the app icon's badge at their unread lines.
 */
export type Recipient = { recipientId: string; badge: number };

/** The category of a chat line's notification, which the app answers from. */
export const CHAT_LINE = "CHAT_LINE";

/** What the APNs response says of a token. */
export type Sent = "sent" | "gone" | "failed";

let signed: { jwt: string; at: number; keyId: string } | undefined;

/** The provider token APNs takes, signed now or kept from before. */
const providerToken = async (
  key: string,
  keyId: string,
  teamId: string
): Promise<string> => {
  const now = Date.now();
  if (signed && signed.keyId === keyId && now - signed.at < TOKEN_MS) {
    return signed.jwt;
  }
  const jwt = await signES256(key, keyId, {
    iat: Math.floor(now / 1000),
    iss: teamId,
  });
  signed = { at: now, jwt, keyId };
  return jwt;
};

/**
 * The APNs payload: words from the app's strings, the badge, the chat and
 * whom it is for. Every one goes through the app's Notification Service
 * Extension (`mutable-content`), which shows nothing for anyone but the
 * user signed in, and puts a chat line's writer's face on it; a line's can
 * be answered from (`category`).
 */
export const payloadOf = (
  alert: Alert,
  { badge, recipientId }: Recipient
): string =>
  JSON.stringify({
    aps: {
      alert: {
        "loc-args": alert.body.args,
        "loc-key": alert.body.key,
        "title-loc-args": alert.title.args,
        "title-loc-key": alert.title.key,
      },
      badge,
      "mutable-content": 1,
      sound: "default",
      "thread-id": `${alert.groupId}/${alert.threadId}`,
      ...(alert.line && { category: CHAT_LINE }),
    },
    groupId: alert.groupId,
    recipientId,
    threadId: alert.threadId,
    ...(alert.line && { authorId: alert.line.authorId, seq: alert.line.seq }),
  });

/**
 * A chat read up to `readTo` on one of the user's devices, for the others
 * to take back the notifications of its lines read (spec/sync-protocol.md,
 * Push): a background push, which shows nothing.
 */
export type Withdrawal = { groupId: string; threadId: string; readTo: number };

/** The APNs payload of a withdrawal: woken in the background, nothing shown. */
export const withdrawalOf = (withdrawal: Withdrawal): string =>
  JSON.stringify({ aps: { "content-available": 1 }, withdraw: withdrawal });

/** Posts `payload` to one device as APNs push type `type`. */
const post = async (
  env: Env,
  device: { token: string; sandbox: boolean },
  payload: string,
  type: "alert" | "background",
  collapseId?: string
): Promise<Sent> => {
  const key = env.APNS_KEY;
  if (key === undefined || key === "") {
    return "failed";
  }
  const host = device.sandbox
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${device.token}`, {
    body: payload,
    headers: {
      // A background push must go at the low priority, or APNs refuses it.
      "apns-priority": type === "alert" ? "10" : "5",
      "apns-push-type": type,
      "apns-topic": TOPIC,
      ...(collapseId !== undefined && { "apns-collapse-id": collapseId }),
      authorization: `bearer ${await providerToken(key, env.APNS_KEY_ID, env.APNS_TEAM_ID)}`,
    },
    method: "POST",
  });
  if (response.ok) {
    return "sent";
  }
  const reason = await response
    .json<{ reason?: string }>()
    .then((body) => body.reason)
    .catch(() => undefined);
  const gone =
    response.status === 410 ||
    (response.status === 400 &&
      (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"));
  return gone ? "gone" : "failed";
};

/**
 * Sends `alert` to one device. "gone" when APNs says the token is no
 * longer the app's (410, or 400 BadDeviceToken), so it is dropped.
 */
export const sendAlert = async (
  env: Env,
  device: { token: string; sandbox: boolean },
  alert: Alert,
  recipient: Recipient
): Promise<Sent> =>
  await post(
    env,
    device,
    payloadOf(alert, recipient),
    "alert",
    alert.collapseId
  );

/** Sends a withdrawal to one device, as `sendAlert` sends a notification. */
export const sendWithdrawal = async (
  env: Env,
  device: { token: string; sandbox: boolean },
  withdrawal: Withdrawal
): Promise<Sent> =>
  await post(env, device, withdrawalOf(withdrawal), "background");
