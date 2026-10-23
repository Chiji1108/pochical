import { createScheduledController } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";
import { inOneLimitWindow, ORIGIN, signInAnonymously } from "./helpers";
import { idToken, link, providerKeys } from "./provider-helpers";

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const sha256 = async (text: string): Promise<Uint8Array> =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  );

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** What the app holds while Apple's page is open: its verifier and nonce. */
const appRequest = async () => {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  return {
    challenge: base64url(await sha256(verifier)),
    nonce,
    nonceHash: hex(await sha256(nonce)),
    verifier,
  };
};

const authorize = async (params: Record<string, string>) =>
  await exports.default.fetch(
    `${ORIGIN}/apple/authorize?${new URLSearchParams(params).toString()}`,
    { redirect: "manual" }
  );

/** Apple posting its answer back, as its form_post does. */
const applePosts = async (
  form: Record<string, string>,
  headers: Record<string, string> = {}
) =>
  await exports.default.fetch(`${ORIGIN}/apple/callback`, {
    body: new URLSearchParams(form),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    method: "POST",
    redirect: "manual",
  });

/** Where the server sent the browser back to, as the app reads it. */
const backToApp = (response: Response) => {
  const location = new URL(response.headers.get("location") ?? "");
  return {
    params: Object.fromEntries(location.searchParams),
    status: response.status,
    to: `${location.protocol}//${location.host}${location.pathname}`,
  };
};

const redeem = async (code: string, verifier: string) => {
  const response = await exports.default.fetch(`${ORIGIN}/apple/redeem`, {
    body: JSON.stringify({ code, verifier }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return { body: await response.json(), status: response.status };
};

/** Apple's answer for `sub`, as its page posts it for the app's request. */
const signedInAtApple = async (
  request: Awaited<ReturnType<typeof appRequest>>,
  sub: string
) => {
  const token = await idToken("apple", sub, request.nonceHash, {
    aud: env.APPLE_SERVICES_ID,
  });
  const back = backToApp(
    await applePosts({
      code: `apple-code-${sub}`,
      id_token: token,
      state: request.challenge,
    })
  );
  return { code: back.params.code ?? "", token };
};

/** How many handoffs the server keeps. */
const handoffs = async () =>
  (await env.DB.prepare(
    "select count(*) as n from verification where identifier like 'apple-handoff:%'"
  ).first<number>("n")) ?? 0;

const REFUSED = {
  code: "HANDOFF_REFUSED",
  message: "Sign in with Apple again",
};

describe("Sign in with Apple's web page, for Android", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends the app on to Apple's page for the Services ID, posting back here", async () => {
    const request = await appRequest();
    const response = await authorize({
      challenge: request.challenge,
      nonce: request.nonceHash,
    });
    const apple = new URL(response.headers.get("location") ?? "");
    expect([
      response.status,
      apple.origin + apple.pathname,
      Object.fromEntries(apple.searchParams),
    ]).toStrictEqual([
      302,
      "https://appleid.apple.com/auth/authorize",
      {
        client_id: "app.pochical.signin",
        nonce: request.nonceHash,
        redirect_uri: `${ORIGIN}/apple/callback`,
        response_mode: "form_post",
        response_type: "code id_token",
        scope: "email",
        state: request.challenge,
      },
    ]);
  });

  it("goes nowhere without a challenge and a nonce hash", async () => {
    const request = await appRequest();
    const answers = [
      await authorize({ nonce: request.nonceHash }),
      await authorize({ challenge: request.challenge }),
      await authorize({ challenge: "short", nonce: request.nonceHash }),
    ];
    expect(answers.map(({ status }) => status)).toStrictEqual([400, 400, 400]);
  });

  it("hands Apple's answer to the app that asked, once, which links with it", async () => {
    providerKeys();
    const request = await appRequest();
    const { code, token } = await signedInAtApple(request, "apple-web-1");
    const first = await redeem(code, request.verifier);
    const again = await redeem(code, request.verifier);
    const session = await signInAnonymously();
    const linked = await link(session, "apple", token, request.nonce);
    expect([first, again, linked]).toStrictEqual([
      {
        body: { authorizationCode: "apple-code-apple-web-1", idToken: token },
        status: 200,
      },
      { body: REFUSED, status: 400 },
      200,
    ]);
  });

  it("goes back to the app's scheme with a code and the state it sent", async () => {
    const request = await appRequest();
    const back = backToApp(
      await applePosts({
        code: "apple-code",
        id_token: "a.b.c",
        state: request.challenge,
      })
    );
    expect([
      back.status,
      back.to,
      Object.keys(back.params).toSorted(),
    ]).toStrictEqual([303, "pochical://apple-sign-in", ["code", "state"]]);
    expect(back.params.state).toBe(request.challenge);
  });

  it("takes nothing for a verifier the app did not ask with, and the code is gone", async () => {
    const request = await appRequest();
    const other = await appRequest();
    const { code } = await signedInAtApple(request, "apple-web-2");
    expect([
      await redeem(code, other.verifier),
      await redeem(code, request.verifier),
    ]).toStrictEqual([
      { body: REFUSED, status: 400 },
      { body: REFUSED, status: 400 },
    ]);
  });

  it("takes nothing once the code is two minutes old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const request = await appRequest();
    const { code } = await signedInAtApple(request, "apple-web-3");
    vi.setSystemTime(Date.now() + 121_000);
    await expect(redeem(code, request.verifier)).resolves.toStrictEqual({
      body: REFUSED,
      status: 400,
    });
  });

  it("keeps nothing for a state that is no app's request", async () => {
    const request = await appRequest();
    const answer = { code: "apple-code", id_token: "a.b.c" };
    const before = await handoffs();
    const back = backToApp(
      await applePosts({ ...answer, state: "not-a-challenge" })
    );
    const afterBad = await handoffs();
    await applePosts({ ...answer, state: request.challenge });
    const afterGood = await handoffs();
    expect([
      back.status,
      back.params,
      afterBad - before,
      afterGood - before,
    ]).toStrictEqual([303, { error: "failed" }, 0, 1]);
  });

  it("says the person cancelled, and what Apple left out failed", async () => {
    const request = await appRequest();
    const cancelled = backToApp(
      await applePosts({
        error: "user_cancelled_authorize",
        state: request.challenge,
      })
    );
    const incomplete = backToApp(
      await applePosts({ code: "apple-code", state: request.challenge })
    );
    expect([cancelled.params, incomplete.params]).toStrictEqual([
      { error: "cancelled", state: request.challenge },
      { error: "failed", state: request.challenge },
    ]);
  });

  it("refuses a code it never gave", async () => {
    const request = await appRequest();
    await expect(redeem("made-up", request.verifier)).resolves.toStrictEqual({
      body: REFUSED,
      status: 400,
    });
  });

  it("holds back answers posted from one address", async () => {
    const request = await appRequest();
    const answer = {
      code: "apple-code",
      id_token: "a.b.c",
      state: request.challenge,
    };
    const answers = await inOneLimitWindow(async (round) => {
      const address = { "CF-Connecting-IP": `192.0.2.${round + 1}` };
      const kept: string[] = [];
      for (let attempt = 0; attempt < 21; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- counted in order
        const back = backToApp(await applePosts(answer, address));
        kept.push(back.params.code === undefined ? "refused" : "kept");
      }
      return kept;
    });
    expect(answers).toStrictEqual([
      ...Array.from({ length: 20 }, () => "kept"),
      "refused",
    ]);
  });

  it("erases at the daily sweep the handoffs never redeemed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const stale = await appRequest();
    const { code: staleCode } = await signedInAtApple(stale, "apple-web-4");
    vi.setSystemTime(Date.now() + 121_000);
    const fresh = await appRequest();
    const { code } = await signedInAtApple(fresh, "apple-web-5");
    const kept = async () =>
      await env.DB.prepare(
        "select count(*) as n from verification where identifier = ?"
      )
        .bind(`apple-handoff:${staleCode}`)
        .first<number>("n");
    const before = await kept();
    await worker.scheduled(
      createScheduledController({
        cron: "0 18 * * *",
        scheduledTime: Date.now(),
      }),
      env
    );
    const after = await kept();
    const redeemed = await redeem(code, fresh.verifier);
    expect([before, after, redeemed.status]).toStrictEqual([1, 0, 200]);
  });
});
