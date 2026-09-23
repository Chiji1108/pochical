import { createPrivateKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "team-id": { type: "string" },
    "key-id": { type: "string" },
    "service-id": { type: "string" },
    "key-file": { type: "string" },
    output: { type: "string" },
  },
});
for (const name of ["team-id", "key-id", "service-id", "key-file", "output"]) {
  if (!values[name]) {
    throw new Error(`--${name} is required`);
  }
}
const now = Math.floor(Date.now() / 1000);
const base64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const header = base64url({ alg: "ES256", kid: values["key-id"] });
const claims = base64url({
  iss: values["team-id"],
  iat: now,
  exp: now + 180 * 24 * 60 * 60,
  aud: "https://appleid.apple.com",
  sub: values["service-id"],
});
const key = createPrivateKey(await readFile(values["key-file"], "utf8"));
if (
  key.asymmetricKeyType !== "ec" ||
  key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
) {
  throw new Error("An Apple ES256 (P-256) private key is required");
}
const body = `${header}.${claims}`;
const signature = sign("sha256", Buffer.from(body), {
  key,
  dsaEncoding: "ieee-p1363",
}).toString("base64url");
await writeFile(values.output, `${body}.${signature}\n`, {
  mode: 0o600,
  flag: "wx",
});
process.stdout.write(
  `Created ${values.output}. Expires ${new Date((now + 180 * 24 * 60 * 60) * 1000).toISOString()}.\n`
);
