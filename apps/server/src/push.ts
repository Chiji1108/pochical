// Notifications sent to the user's devices (spec/sync-protocol.md, Push):
// an iPhone's through Apple's push service (apns.ts), an Android phone's
// through Firebase Cloud Messaging (fcm.ts). What is sent is the same for
// both; each words it in its own payload. Whatever comes of a push is
// logged and counted here, alike for both.

import { attemptApns } from "./apns";
import { attemptFcm } from "./fcm";
import type { Device } from "./push-tokens";

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
  // device to take the notification back once it is read; an answer from
  // Pochical's people's too.
  line?: { authorId: string; seq: number };
};

/**
 * Whom a notification is sent to: the user, whose device shows it only
 * while signed in as them, and the app icon's badge at their unread lines.
 */
export type Recipient = { recipientId: string; badge: number };

/**
 * A chat read up to `readTo` on one of the user's devices, for the others
 * to take back the notifications of its lines read (spec/sync-protocol.md,
 * Push): sent in the background, it shows nothing.
 */
export type Withdrawal = { groupId: string; threadId: string; readTo: number };

/** What is sent to a device: a notification, or a withdrawal. */
export type Push =
  | { kind: "alert"; alert: Alert; recipient: Recipient }
  | { kind: "withdrawal"; withdrawal: Withdrawal };

/**
 * What the push service's answer says of a token: "gone" when it is no
 * longer the app's, so it is dropped.
 */
export type Sent = "sent" | "gone" | "failed";

/** One push and what came of it, as logged and counted. */
export type Outcome = {
  sent: Sent;
  // The HTTP status the push service answered with, 0 when no answer came.
  status: number;
  // The service's reason, or what kept the push from reaching it.
  reason: string;
};

/** Posts `push` to one device through its platform's service. */
const attempt = async (
  env: Env,
  device: Device,
  push: Push
): Promise<Outcome> => {
  try {
    return device.platform === "apns"
      ? await attemptApns(env, device, push)
      : await attemptFcm(env, device, push);
  } catch (error) {
    // The error may name the address, which can hold the device's token.
    const reason = String(error).replaceAll(device.token, "{token}");
    return { reason, sent: "failed", status: 0 };
  }
};

/**
 * Posts `push` to one device, logs a push that was not sent (Workers Logs,
 * `push`), and counts every push in Analytics Engine (`PUSH_OUTCOMES`:
 * index and blob1 what came of it, blob2 the service's reason, blob3 the
 * push's kind, blob4 "sandbox" or "production", blob5 the platform,
 * double1 the HTTP status).
 */
const post = async (env: Env, device: Device, push: Push): Promise<Sent> => {
  const outcome = await attempt(env, device, push);
  const sandbox = device.platform === "apns" && device.sandbox;
  if (outcome.sent !== "sent") {
    console.warn({
      message: "Push not sent",
      push: {
        ...outcome,
        kind: push.kind,
        platform: device.platform,
        sandbox,
      },
    });
  }
  env.PUSH_OUTCOMES.writeDataPoint({
    blobs: [
      outcome.sent,
      outcome.reason,
      push.kind,
      sandbox ? "sandbox" : "production",
      device.platform,
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
  await post(env, device, { alert, kind: "alert", recipient });

/** Sends a withdrawal to one device, as `sendAlert` sends a notification. */
export const sendWithdrawal = async (
  env: Env,
  device: Device,
  withdrawal: Withdrawal
): Promise<Sent> => await post(env, device, { kind: "withdrawal", withdrawal });
