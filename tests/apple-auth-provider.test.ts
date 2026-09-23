import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { customFetch } from "@auth/core";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import {
  appleAuthProvider,
  createAppleClientSecret,
} from "../convex-lib/appleAuthProvider";
import { materializeProvider } from "../node_modules/@convex-dev/auth/dist/server/provider_utils.js";

const pair = await generateKeyPair("ES256", { extractable: true });
const credentials = {
  AUTH_APPLE_ID: "tech.chiji.pochical.auth",
  AUTH_APPLE_TEAM_ID: "TESTTEAM",
  AUTH_APPLE_KEY_ID: "TESTKEY",
  AUTH_APPLE_PRIVATE_KEY: await exportPKCS8(pair.privateKey),
  AUTH_APPLE_SECRET: "expired-legacy-secret",
};
const savedEnv = Object.fromEntries(
  Object.keys(credentials).map((name) => [name, process.env[name]])
);
afterEach(() => {
  mock.restore();
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

test("Apple client secrets have verifiable signatures and five-minute lifetimes", async () => {
  const now = 1_800_000_000;
  const secret = await createAppleClientSecret(credentials, now);
  const { payload, protectedHeader } = await jwtVerify(secret, pair.publicKey, {
    algorithms: ["ES256"],
    issuer: credentials.AUTH_APPLE_TEAM_ID,
    audience: "https://appleid.apple.com",
    subject: credentials.AUTH_APPLE_ID,
    currentDate: new Date(now * 1000),
  });
  expect(protectedHeader.kid).toBe(credentials.AUTH_APPLE_KEY_ID);
  expect(payload.iat).toBe(now);
  expect(payload.exp).toBe(now + 300);
  await expect(
    jwtVerify(secret, pair.publicKey, {
      currentDate: new Date((now + 301) * 1000),
    })
  ).rejects.toThrow();
  const escapedSecret = await createAppleClientSecret(
    {
      ...credentials,
      AUTH_APPLE_PRIVATE_KEY: credentials.AUTH_APPLE_PRIVATE_KEY.replaceAll(
        "\n",
        "\\n"
      ),
    },
    now
  );
  expect(
    (
      await jwtVerify(escapedSecret, pair.publicKey, {
        currentDate: new Date(now * 1000),
      })
    ).payload.sub
  ).toBe(credentials.AUTH_APPLE_ID);
});

test("legacy secrets work during migration, but incomplete signing settings fail closed", async () => {
  expect(await createAppleClientSecret({ AUTH_APPLE_SECRET: "legacy" })).toBe(
    "legacy"
  );
  await expect(createAppleClientSecret({})).rejects.toThrow(
    "Apple sign-in requires"
  );
  for (const name of [
    "AUTH_APPLE_ID",
    "AUTH_APPLE_TEAM_ID",
    "AUTH_APPLE_KEY_ID",
    "AUTH_APPLE_PRIVATE_KEY",
  ]) {
    await expect(
      createAppleClientSecret({ ...credentials, [name]: undefined })
    ).rejects.toThrow("Apple sign-in requires");
  }
  await expect(
    createAppleClientSecret({
      ...credentials,
      AUTH_APPLE_PRIVATE_KEY: "invalid",
    })
  ).rejects.toThrow();
});

test("Convex's materialized provider generates fresh secrets even after 180 days", async () => {
  Object.assign(process.env, credentials);
  const requests: Request[] = [];
  spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(Response.json({ access_token: "test-token" }));
  });
  const provider = materializeProvider(appleAuthProvider());
  const send = provider[customFetch];
  expect(send).toBeDefined();
  const now = 1_800_000_000;
  for (const timestamp of [now, now + 181 * 24 * 60 * 60]) {
    spyOn(Date, "now").mockReturnValue(timestamp * 1000);
    const body = new URLSearchParams({
      client_id: credentials.AUTH_APPLE_ID,
      client_secret: provider.clientSecret,
      grant_type: "authorization_code",
      code: "apple-code",
      redirect_uri: "https://example.convex.site/api/auth/callback/apple",
    });
    const response = await send("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(response.status).toBe(200);
    const request = requests.at(-1);
    const sent = new URLSearchParams(await request.text());
    const { payload } = await jwtVerify(
      sent.get("client_secret"),
      pair.publicKey,
      {
        issuer: credentials.AUTH_APPLE_TEAM_ID,
        audience: "https://appleid.apple.com",
        subject: credentials.AUTH_APPLE_ID,
        currentDate: new Date(timestamp * 1000),
      }
    );
    expect(payload.iat).toBe(timestamp);
    expect(payload.exp).toBe(timestamp + 300);
    expect(sent.get("code")).toBe("apple-code");
    expect(sent.get("redirect_uri")).toBe(body.get("redirect_uri"));
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(request.redirect).toBe("error");
    expect(body.get("client_secret")).toBe("generated-per-request");
  }
});

test("Apple discovery keeps its provider workaround and never receives a secret", async () => {
  const requests: Request[] = [];
  spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(
      Response.json({ issuer: "https://appleid.apple.com" })
    );
  });
  const send = appleAuthProvider()[customFetch];
  const response = await send(
    "https://appleid.apple.com/.well-known/openid-configuration"
  );
  expect((await response.json()).userinfo_endpoint).toBe(
    "https://appleid.apple.com/fake_endpoint"
  );
  await send("https://other.example/auth/token", {
    method: "POST",
    body: "test",
  });
  expect(await requests[0].text()).toBe("");
  expect(await requests[1].text()).toBe("test");
});

test("invalid requests and signing failures never send a placeholder to Apple", async () => {
  Object.assign(process.env, credentials);
  const network = spyOn(globalThis, "fetch");
  const send = appleAuthProvider()[customFetch];
  await expect(send("https://appleid.apple.com/auth/token")).rejects.toThrow(
    "Unexpected Apple token request format"
  );
  const options = {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "wrong-app" }),
  };
  await expect(
    send("https://appleid.apple.com/auth/token", options)
  ).rejects.toThrow("client ID does not match");
  options.body.set("client_id", credentials.AUTH_APPLE_ID);
  process.env.AUTH_APPLE_PRIVATE_KEY = "invalid";
  await expect(
    send("https://appleid.apple.com/auth/token", options)
  ).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
});
