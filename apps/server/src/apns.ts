// Notifications sent to the user's iPhones through Apple's push service
// (APNs), with a token-based key: a JWT signed with the team's .p8 key
// (ES256). APNs speaks only HTTP/2, which a deployed Worker's fetch is
// upgraded to by Cloudflare; `wrangler dev` cannot reach it, so a local
// server sends nothing to iPhones.

import { fitted } from "./alert-size";
import { signJwt } from "./jwt";
import type { Alert, Outcome, Push, Recipient, Withdrawal } from "./push";
import { postPush, refusal } from "./push-refusal";
import type { Device } from "./push-tokens";

/** The app's bundle id, the topic every notification is for. */
const TOPIC = "app.pochical";

/**
 * How long a signed token is reused. Apple asks for a new one no more than
 * once every 20 minutes on a connection and no less than once an hour
 * ("Establishing a token-based connection to APNs").
 */
const TOKEN_MS = 50 * 60 * 1000;

/** The category of a chat line's notification, which the app answers from. */
const CHAT_LINE = "CHAT_LINE";

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
    jwt: signJwt("ES256", key, keyId, {
      iat: Math.floor(now / 1000),
      iss: teamId,
    }),
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
const payloadOf = (alert: Alert, { badge, recipientId }: Recipient): string =>
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

/** The APNs payload of `alert`, its words cut to the size APNs takes. */
const fittedPayloadOf = (alert: Alert, recipient: Recipient): string => {
  const payload = (each: Alert): string => payloadOf(each, recipient);
  return payload(fitted(alert, payload));
};

/** The APNs payload of a withdrawal: woken in the background, nothing shown. */
const withdrawalOf = (withdrawal: Withdrawal): string =>
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
 * DeviceTokenNotForTopic), so it is dropped; "later" on 429
 * TooManyRequests, 500 InternalServerError and 503 ServiceUnavailable, so
 * it is tried again ("Handling notification responses from APNs").
 */
const outcomeOf = async (response: Response): Promise<Outcome> => {
  const { status } = response;
  if (response.ok) {
    return { reason: "", sent: "sent", status };
  }
  const reason = reasonOf(await response.text());
  const gone =
    status === 410 ||
    (status === 400 &&
      (reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic"));
  return refusal(response, reason, gone ? "gone" : "failed");
};

/**
 * Posts `push` to an iPhone: a notification as an alert, a withdrawal in
 * the background.
 */
export const attemptApns = async (
  env: Env,
  { sandbox, token }: Extract<Device, { platform: "apns" }>,
  push: Push
): Promise<Outcome> => {
  const key = env.APNS_KEY;
  if (key === undefined || key === "") {
    return { reason: "no APNS_KEY", sent: "failed", status: 0 };
  }
  const alert = push.kind === "alert";
  const host = sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const bearer = await providerToken(key, env.APNS_KEY_ID, env.APNS_TEAM_ID);
  const answer = await postPush(
    `https://${host}/3/device/${token}`,
    {
      body: alert
        ? fittedPayloadOf(push.alert, push.recipient)
        : withdrawalOf(push.withdrawal),
      headers: {
        // A notification tried again replaces the one before should that
        // have reached the device unanswered, rather than showing twice.
        ...(alert && { "apns-collapse-id": push.id }),
        // A background push must go at the low priority, or APNs refuses it.
        "apns-priority": alert ? "10" : "5",
        "apns-push-type": alert ? "alert" : "background",
        "apns-topic": TOPIC,
        authorization: `bearer ${bearer}`,
      },
    },
    token
  );
  return answer instanceof Response ? await outcomeOf(answer) : answer;
};
