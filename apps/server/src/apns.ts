// Notifications sent to the user's iPhones through Apple's push service
// (APNs), with a token-based key: a JWT signed with the team's .p8 key
// (ES256). APNs speaks only HTTP/2, which a deployed Worker's fetch is
// upgraded to by Cloudflare; `wrangler dev` cannot reach it, so a local
// server sends nothing.

import { signES256 } from "./es256";
import type { Device } from "./push-tokens";

/** The app's bundle id, the topic every notification is for. */
const TOPIC = "app.pochical";

/**
 * How long a signed token is reused. Apple asks for a new one no more than
 * once every 20 minutes on a connection and no less than once an hour
 * ("Establishing a token-based connection to APNs").
 */
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

/** One push and what came of it, as logged and counted. */
type Outcome = {
  sent: Sent;
  type: "alert" | "background";
  sandbox: boolean;
  // The HTTP status APNs answered with, 0 when no answer came.
  status: number;
  // APNs' reason, or what kept the push from reaching it.
  reason: string;
};

/**
 * The token this isolate signed last. Apple takes one token from many
 * servers and counts its renewals per connection, so each isolate renewing
 * its own on its own clock keeps the rule. The signing is kept as it
 * starts, so pushes sent at once share one token.
 */
let signed: { jwt: Promise<string>; at: number; keyId: string } | undefined;

/** The provider token APNs takes, signed now or kept from before. */
const providerToken = async (
  key: string,
  keyId: string,
  teamId: string
): Promise<string> => {
  const now = Date.now();
  if (signed && signed.keyId === keyId && now - signed.at < TOKEN_MS) {
    return await signed.jwt;
  }
  const kept = {
    at: now,
    jwt: signES256(key, keyId, { iat: Math.floor(now / 1000), iss: teamId }),
    keyId,
  };
  signed = kept;
  try {
    return await kept.jwt;
  } catch (error) {
    // A key that failed to sign is tried again by the next push.
    if (signed === kept) {
      signed = undefined;
    }
    throw error;
  }
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

/** APNs' `reason`, from a refusal's JSON body, or the body itself. */
const reasonOf = (body: string): string => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "reason" in parsed &&
      typeof parsed.reason === "string"
    ) {
      return parsed.reason;
    }
  } catch {
    // Not APNs' JSON: the body is all there is to say.
  }
  return body;
};

/**
 * What APNs' answer says of the push. "gone" when the token is no longer
 * the app's (410 Unregistered, or 400 BadDeviceToken or
 * DeviceTokenNotForTopic), so it is dropped.
 */
const outcomeOf = async (
  response: Response,
  type: Outcome["type"],
  sandbox: boolean
): Promise<Outcome> => {
  const { status } = response;
  if (response.ok) {
    return { reason: "", sandbox, sent: "sent", status, type };
  }
  const reason = reasonOf(await response.text());
  const gone =
    status === 410 ||
    (status === 400 &&
      (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"));
  return { reason, sandbox, sent: gone ? "gone" : "failed", status, type };
};

/** Posts `payload` to one device as APNs push type `type`. */
const attempt = async (
  env: Env,
  { sandbox, token }: Device,
  payload: string,
  type: Outcome["type"],
  collapseId?: string
): Promise<Outcome> => {
  const key = env.APNS_KEY;
  if (key === undefined || key === "") {
    return { reason: "no APNS_KEY", sandbox, sent: "failed", status: 0, type };
  }
  const host = sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  try {
    const response = await fetch(`https://${host}/3/device/${token}`, {
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
    return await outcomeOf(response, type, sandbox);
  } catch (error) {
    return { reason: String(error), sandbox, sent: "failed", status: 0, type };
  }
};

/**
 * Posts `payload` to one device, logs a push that was not sent (Workers
 * Logs, `apns`), and counts every push in Analytics Engine
 * (`PUSH_OUTCOMES`: index and blob1 what came of it, blob2 APNs' reason,
 * blob3 the push type, blob4 "sandbox" or "production", double1 the HTTP
 * status).
 */
const post = async (
  env: Env,
  device: Device,
  payload: string,
  type: Outcome["type"],
  collapseId?: string
): Promise<Sent> => {
  const outcome = await attempt(env, device, payload, type, collapseId);
  if (outcome.sent !== "sent") {
    console.warn({ apns: outcome });
  }
  env.PUSH_OUTCOMES.writeDataPoint({
    blobs: [
      outcome.sent,
      outcome.reason,
      outcome.type,
      outcome.sandbox ? "sandbox" : "production",
    ],
    doubles: [outcome.status],
    indexes: [outcome.sent],
  });
  return outcome.sent;
};

/** Sends `alert` to one device. */
export const sendAlert = async (
  env: Env,
  device: Device,
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
  device: Device,
  withdrawal: Withdrawal
): Promise<Sent> =>
  await post(env, device, withdrawalOf(withdrawal), "background");
