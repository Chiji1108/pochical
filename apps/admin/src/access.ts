// Who gets into the admin site (spec/admin.md): Cloudflare Access lets in
// only Pochical's people and says so with a signed token on every request,
// which is checked here too, so a request that went around Access is
// refused.

type Jwk = JsonWebKey & { kid?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isJwk = (value: unknown): value is Jwk =>
  isRecord(value) && typeof value.kty === "string";

const base64urlBytes = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(text.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.codePointAt(0) ?? 0
  );

const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(base64urlBytes(text)));
  } catch {
    return null;
  }
};

/** Whether `signature` is `jwk`'s over `text`; not when either is garbled. */
const signedBy = async (
  jwk: Jwk,
  text: string,
  signature: string
): Promise<boolean> => {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64urlBytes(signature),
      new TextEncoder().encode(text)
    );
  } catch {
    return false;
  }
};

/**
 * Whether `token` is Access's word that one of Pochical's people signed
 * in: RS256, signed by one of `keys` (the team's certs), for `audience`,
 * from `issuer`, and not expired.
 */
export const verifyAccess = async (
  token: string,
  keys: readonly Jwk[],
  audience: string,
  issuer: string,
  nowMs = Date.now()
): Promise<boolean> => {
  const [head = "", body = "", signature = ""] = token.split(".");
  const header = jsonOf(head);
  const claims = jsonOf(body);
  if (!(isRecord(header) && isRecord(claims)) || header.alg !== "RS256") {
    return false;
  }
  const jwk = keys.find((key) => key.kid === header.kid);
  if (jwk === undefined) {
    return false;
  }
  const signed = await signedBy(jwk, `${head}.${body}`, signature);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    signed &&
    audiences.includes(audience) &&
    claims.iss === issuer &&
    typeof claims.exp === "number" &&
    claims.exp * 1000 > nowMs
  );
};

/**
 * Whether a request comes from one of Pochical's people. Until the team
 * and the audience are set, only the local dev server lets anyone in.
 */
export const allowed = async (
  request: Request,
  team: string,
  audience: string,
  local: boolean
): Promise<boolean> => {
  if (team === "" || audience === "") {
    return local;
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (token === null) {
    return false;
  }
  const issuer = `https://${team}`;
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
  const certs: unknown = await response.json();
  const keys =
    isRecord(certs) && Array.isArray(certs.keys)
      ? certs.keys.filter(isJwk)
      : [];
  return await verifyAccess(token, keys, audience, issuer);
};
