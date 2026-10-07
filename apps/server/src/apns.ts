// Notifications sent to the user's iPhones through Apple's push service
// (APNs), with a token-based key: a JWT signed with the team's .p8 key
// (ES256), kept and reused for 50 minutes as Apple asks. APNs speaks only
// HTTP/2, which a deployed Worker's fetch is upgraded to by Cloudflare;
// `wrangler dev` cannot reach it, so a local server sends nothing.

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
  // Which chat it opens, and groups it with the chat's others.
  groupId: string;
  threadId: string;
};

/** What the APNs response says of a token. */
export type Sent = "sent" | "gone" | "failed";

let signed: { jwt: string; at: number; keyId: string } | undefined;

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const text = (value: string): string =>
  base64url(new TextEncoder().encode(value));

/** The .p8 file's PKCS #8 key, from its PEM text. */
const pkcs8 = (pem: string): Uint8Array => {
  const body = pem.replaceAll(/-----[^-]+-----|\s/gu, "");
  return Uint8Array.from(atob(body), (char) => char.codePointAt(0) ?? 0);
};

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
  const header = text(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = text(
    JSON.stringify({ iat: Math.floor(now / 1000), iss: teamId })
  );
  const signer = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(key),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { hash: "SHA-256", name: "ECDSA" },
    signer,
    new TextEncoder().encode(`${header}.${claims}`)
  );
  const jwt = `${header}.${claims}.${base64url(new Uint8Array(signature))}`;
  signed = { at: now, jwt, keyId };
  return jwt;
};

/** The APNs payload: words from the app's strings, the badge and the chat. */
export const payloadOf = (alert: Alert, badge: number): string =>
  JSON.stringify({
    aps: {
      alert: {
        "loc-args": alert.body.args,
        "loc-key": alert.body.key,
        "title-loc-args": alert.title.args,
        "title-loc-key": alert.title.key,
      },
      badge,
      sound: "default",
      "thread-id": `${alert.groupId}/${alert.threadId}`,
    },
    groupId: alert.groupId,
    threadId: alert.threadId,
  });

/**
 * Sends `alert` to one device. "gone" when APNs says the token is no
 * longer the app's (410, or 400 BadDeviceToken), so it is dropped.
 */
export const sendAlert = async (
  env: Env,
  device: { token: string; sandbox: boolean },
  alert: Alert,
  badge: number
): Promise<Sent> => {
  const key = env.APNS_KEY;
  if (key === undefined || key === "") {
    return "failed";
  }
  const host = device.sandbox
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${device.token}`, {
    body: payloadOf(alert, badge),
    headers: {
      "apns-push-type": "alert",
      "apns-topic": TOPIC,
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
