import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Apple setup script produces a verifiable ES256 secret for the Service ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pochical-apple-test-"));
  try {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const keyFile = join(directory, "test.p8");
    const output = join(directory, "secret.txt");
    await writeFile(
      keyFile,
      privateKey.export({ type: "pkcs8", format: "pem" }),
      { mode: 0o600 }
    );
    const result = spawnSync("node", [
      "scripts/create-apple-secret.mjs",
      "--team-id",
      "TEAM",
      "--key-id",
      "KEY",
      "--service-id",
      "tech.chiji.pochical.auth",
      "--key-file",
      keyFile,
      "--output",
      output,
    ]);
    expect(result.status).toBe(0);
    const [header, payload, signature] = (await readFile(output, "utf8"))
      .trim()
      .split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.sub).toBe("tech.chiji.pochical.auth");
    expect(claims.aud).toBe("https://appleid.apple.com");
    expect(claims.exp - claims.iat).toBe(180 * 24 * 60 * 60);
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url")
      )
    ).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
