// Pochical's people's own pages (spec/admin.md): the chats with users and
// the reports, at api.pochical.app/admin behind Cloudflare Access, which
// lets in only Pochical's people. Plain pages and forms, with nothing for
// the apps to carry: no script, served by the server that holds the data.
import { textLimits } from "@pochical/design/limits";

import { characterCount } from "./text-limits";

export const ADMIN_PATH = "/admin";

type AdminEnv = Env & {
  // Cloudflare Access's team domain and the application's audience tag;
  // without them only a server on this computer or under test, told by
  // ADMIN_LOCAL, lets anyone in.
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_LOCAL?: string;
};

type Jwk = JsonWebKey & { kid?: string };

const base64urlBytes = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(text.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.codePointAt(0) ?? 0
  );

const jsonOf = (text: string): unknown =>
  JSON.parse(new TextDecoder().decode(base64urlBytes(text)));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isJwk = (value: unknown): value is Jwk =>
  isRecord(value) && typeof value.kty === "string";

/**
 * Whether `token` is Cloudflare Access's word that one of Pochical's
 * people signed in: signed by one of `keys` (the team's certs), for
 * `audience`, from `issuer`, and not expired.
 */
export const verifyAccess = async (
  token: string,
  keys: Jwk[],
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
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["verify"]
  );
  const signed = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64urlBytes(signature),
    new TextEncoder().encode(`${head}.${body}`)
  );
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    signed &&
    audiences.includes(audience) &&
    claims.iss === issuer &&
    typeof claims.exp === "number" &&
    claims.exp * 1000 > nowMs
  );
};

/** Whether the request comes from one of Pochical's people. */
const allowed = async (request: Request, env: AdminEnv): Promise<boolean> => {
  const team = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  if (team === undefined || audience === undefined) {
    // A server on this computer (wrangler dev, run with ADMIN_LOCAL) or
    // under test; the real one is never given it.
    return env.ADMIN_LOCAL === "1";
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

const escape = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const when = (ms: number): string =>
  new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

const page = (title: string, body: string, status = 200): Response =>
  new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>body{font:15px/1.6 system-ui,sans-serif;margin:0 auto;max-width:860px;padding:16px;color:#222}nav a{margin-right:16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}.me{background:#eef4ee}.staff{background:#f4f4f4}.line{border-radius:10px;margin:8px 0;padding:8px 12px;white-space:pre-wrap}.meta{color:#777;font-size:12px}textarea{box-sizing:border-box;font:inherit;width:100%}.open{color:#b0564f;font-weight:600}</style></head>
<body><nav><a href="${ADMIN_PATH}/support">サポート</a><a href="${ADMIN_PATH}/reports">通報</a></nav><h1>${escape(title)}</h1>${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status }
  );

type ChatRow = {
  user_id: string;
  last_at: number;
  text: string;
  from_support: number;
};

/** Every user's chat, the latest first, saying which wait for an answer. */
const supportList = async (env: Env): Promise<Response> => {
  const { results } = await env.DB.prepare(
    `select c.user_id, c.last_at, m.text, m.from_support
     from support_chats c join support_messages m on m.user_id = c.user_id
     and m.created_at = (select max(created_at) from support_messages where user_id = c.user_id)
     order by c.last_at desc limit 200`
  ).all<ChatRow>();
  const rows = results
    .map(
      (row) =>
        `<tr><td>${when(row.last_at)}</td><td><a href="${ADMIN_PATH}/support/${encodeURIComponent(row.user_id)}">${escape(row.user_id.slice(0, 8))}</a></td><td>${escape(row.text.slice(0, 80))}</td><td>${row.from_support === 1 ? "返信済み" : '<span class="open">未返信</span>'}</td></tr>`
    )
    .join("");
  return page(
    "サポート",
    `<table><tr><th>最新</th><th>ユーザー</th><th>最新の行</th><th>状態</th></tr>${rows}</table>`
  );
};

type MessageRow = {
  created_at: number;
  from_support: number;
  text: string;
  device: string | null;
};

/** One user's chat, oldest first, and a form to answer. */
const supportChat = async (env: Env, userId: string): Promise<Response> => {
  const { results } = await env.DB.prepare(
    "select created_at, from_support, text, device from support_messages where user_id = ? order by created_at"
  )
    .bind(userId)
    .all<MessageRow>();
  const lines = results
    .map((row) => {
      const who = row.from_support === 1 ? "ポチカル" : "ユーザー";
      const device = row.device === null ? "" : `・${escape(row.device)}`;
      return `<div class="line ${row.from_support === 1 ? "staff" : "me"}"><div class="meta">${who}・${when(row.created_at)}${device}</div>${escape(row.text)}</div>`;
    })
    .join("");
  return page(
    `サポート・${userId.slice(0, 8)}`,
    `${lines}<form method="post"><textarea name="text" rows="4" maxlength="${textLimits.chatMessage}" required></textarea><p><button>ポチカルとして返信</button></p></form>`
  );
};

/** An answer from Pochical's people, kept and told to the user's devices. */
const answer = async (
  request: Request,
  env: Env,
  userId: string
): Promise<Response> => {
  const form = await request.formData();
  const field = form.get("text");
  const text = typeof field === "string" ? field.trim() : "";
  if (text === "" || characterCount(text) > textLimits.chatMessage) {
    return page("返信できません", "<p>空か、長すぎます。</p>", 400);
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "insert into support_messages (id, user_id, from_support, text, created_at) values (?, ?, 1, ?, ?)"
    ).bind(crypto.randomUUID(), userId, text, now),
    env.DB.prepare(
      "insert into support_chats (user_id, last_at) values (?, ?) on conflict (user_id) do update set last_at = excluded.last_at"
    ).bind(userId, now),
  ]);
  await env.USERS.getByName(userId).supportAnswered(text);
  return Response.redirect(new URL(request.url).toString(), 303);
};

type ReportRow = {
  created_at: number;
  reason: string;
  group_id: string;
  reporter_id: string;
  target_id: string;
  context: string;
};

const REASON_NAMES: Record<string, string> = {
  explicit: "性的・暴力的",
  harassment: "嫌がらせ",
  impersonation: "なりすまし",
  other: "その他",
  spam: "スパム",
};

/** What members reported, the latest first, with what they saw. */
const reportList = async (env: Env): Promise<Response> => {
  const { results } = await env.DB.prepare(
    "select created_at, reason, group_id, reporter_id, target_id, context from reports order by created_at desc limit 200"
  ).all<ReportRow>();
  const rows = results
    .map(
      (row) =>
        `<tr><td>${when(row.created_at)}</td><td>${escape(REASON_NAMES[row.reason] ?? row.reason)}</td><td>${escape(row.group_id.slice(0, 8))}</td><td>${escape(row.reporter_id.slice(0, 8))}</td><td>${escape(row.target_id.slice(0, 8))}</td><td><pre style="white-space:pre-wrap;margin:0">${escape(row.context)}</pre></td></tr>`
    )
    .join("");
  return page(
    "通報",
    `<table><tr><th>日時</th><th>理由</th><th>グループ</th><th>通報した人</th><th>対象</th><th>内容</th></tr>${rows}</table>`
  );
};

const CHAT_PATH = /^\/admin\/support\/(?<userId>[^/]+)$/u;

/** A request under /admin, once it is known to be from Pochical's people. */
export const adminRequest = async (
  request: Request,
  env: AdminEnv
): Promise<Response> => {
  if (!(await allowed(request, env))) {
    return new Response("Forbidden", { status: 403 });
  }
  const { pathname } = new URL(request.url);
  if (pathname === ADMIN_PATH || pathname === `${ADMIN_PATH}/`) {
    return Response.redirect(
      new URL(`${ADMIN_PATH}/support`, request.url).toString(),
      303
    );
  }
  if (pathname === `${ADMIN_PATH}/support`) {
    return await supportList(env);
  }
  if (pathname === `${ADMIN_PATH}/reports`) {
    return await reportList(env);
  }
  const userId = CHAT_PATH.exec(pathname)?.groups?.userId;
  if (userId !== undefined) {
    const id = decodeURIComponent(userId);
    if (request.method !== "POST") {
      return await supportChat(env, id);
    }
    // An answer only from the admin page itself, not a form elsewhere.
    if (request.headers.get("Origin") !== new URL(request.url).origin) {
      return new Response("Forbidden", { status: 403 });
    }
    return await answer(request, env, id);
  }
  return page("見つかりません", "", 404);
};
