// A JWT signed with one of Apple's .p8 keys (ES256), as APNs takes for its
// provider token and Sign in with Apple for the app's client secret.

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const text = (value: string): string =>
  base64url(new TextEncoder().encode(value));

/** The .p8 file's PKCS #8 key, from its PEM text. */
const pkcs8 = (pem: string): Uint8Array<ArrayBuffer> => {
  const body = pem.replaceAll(/-----[^-]+-----|\s/gu, "");
  return Uint8Array.from(atob(body), (char) => char.codePointAt(0) ?? 0);
};

/** `claims` signed with the .p8 key `key`, whose id is `keyId`. */
export const signES256 = async (
  key: string,
  keyId: string,
  claims: Record<string, unknown>
): Promise<string> => {
  const header = text(JSON.stringify({ alg: "ES256", kid: keyId }));
  const body = text(JSON.stringify(claims));
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
    new TextEncoder().encode(`${header}.${body}`)
  );
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
};
