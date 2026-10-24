// A JWT signed with a PKCS #8 private key from its PEM text: one of
// Apple's .p8 keys (ES256), as APNs takes for its provider token and Sign
// in with Apple for the app's client secret, or a Google service account's
// RSA key (RS256), as Google's OAuth takes for FCM's access token.

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");

const text = (value: string): string =>
  base64url(new TextEncoder().encode(value));

/** The key's PKCS #8 bytes, from its PEM text. */
const pkcs8 = (pem: string): Uint8Array<ArrayBuffer> => {
  const body = pem.replaceAll(/-----[^-]+-----|\s/gu, "");
  return Uint8Array.from(atob(body), (char) => char.codePointAt(0) ?? 0);
};

/** How each algorithm's key is read and signs, in WebCrypto's words. */
const ALGORITHMS = {
  ES256: {
    key: { name: "ECDSA", namedCurve: "P-256" },
    sign: { hash: "SHA-256", name: "ECDSA" },
  },
  RS256: {
    key: { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    sign: { name: "RSASSA-PKCS1-v1_5" },
  },
} as const;

/** `claims` signed as `alg` with the PEM key `key`, whose id is `keyId`. */
export const signJwt = async (
  alg: keyof typeof ALGORITHMS,
  key: string,
  keyId: string,
  claims: Record<string, unknown>
): Promise<string> => {
  const header = text(JSON.stringify({ alg, kid: keyId }));
  const body = text(JSON.stringify(claims));
  const signer = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(key),
    ALGORITHMS[alg].key,
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    ALGORITHMS[alg].sign,
    signer,
    new TextEncoder().encode(`${header}.${body}`)
  );
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
};
