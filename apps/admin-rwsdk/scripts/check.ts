// Checks the sketch against a running dev server or preview and a seeded
// local `mise run server`:
//
//   ADMIN=http://localhost:3197 USER_ID=... bun apps/admin-rwsdk/scripts/check.ts
//
// A throwaway helper of the admin sketches, not held to the repo's lint.
/* oxlint-disable eslint/curly, eslint/no-await-in-loop, eslint/prefer-named-capture-group, eslint/require-unicode-regexp, typescript/no-unsafe-type-assertion, typescript/prefer-regexp-exec, unicorn/no-await-expression-member */
import { chromium } from "playwright-core";

const admin = process.env.ADMIN ?? "http://localhost:3197";
const userId = process.env.USER_ID ?? "";
const chat = `${admin}/support/${userId}`;
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed += 1;
};

const html = async (path: string) =>
  await (await fetch(`${admin}${path}`)).text();
const staffLines = async () =>
  (await html(`/support/${userId}`)).split('data-from="staff"').length - 1;
const post = async (
  url: string,
  body: Record<string, string>,
  origin = admin
) =>
  await fetch(url, {
    body: new URLSearchParams(body),
    headers: origin === "" ? {} : { Origin: origin },
    method: "POST",
    redirect: "manual",
  });

for (const path of ["/", "/reports", "/bucket", `/support/${userId}`]) {
  const response = await fetch(`${admin}${path}`);
  check(response.status === 200, `GET ${path} is 200`);
}
const photoSrc = (await html(`/support/${userId}`)).match(
  /src="(\/photos\/[^"]+)"/
)?.[1];
const photo = await fetch(`${admin}${photoSrc}`);
check(
  photo.status === 200 && photo.headers.get("content-type") === "image/jpeg",
  `photo ${photoSrc} is a JPEG`
);
check(
  (await fetch(`${admin}/photos/${userId}/nope`)).status === 404,
  "a missing photo is 404"
);

// Without JavaScript: the form's own POST.
const before = await staffLines();
const blank = await post(chat, { draftId: "d-blank", text: "   " });
const blankHtml = await blank.text();
check(
  blank.status === 400 && blankHtml.includes("返信を書いてください。"),
  "blank answer refused in the form (400)"
);
const long = "あ".repeat(5000);
const tooLong = await post(chat, { draftId: "d-long", text: long });
const tooLongHtml = await tooLong.text();
check(
  tooLong.status === 400 &&
    tooLongHtml.includes("返信が長すぎます") &&
    tooLongHtml.includes(long),
  "too long refused, words kept"
);
const draftId = crypto.randomUUID();
const first = await post(chat, { draftId, text: "JSなしの返信です" });
check(
  first.status === 303 &&
    first.headers.get("location") === `/support/${userId}`,
  "kept answer redirects (PRG)"
);
const again = await post(chat, { draftId, text: "  JSなしの返信です  " });
check(again.status === 303, "resend with the same draft is accepted");
check(
  (await staffLines()) === before + 1,
  "resend with the same draft is one line"
);
await post(chat, { draftId, text: "同じ下書きの別の言葉" });
check(
  (await staffLines()) === before + 2,
  "other words from the same draft are a new line"
);

// Cross-site POSTs.
check(
  (await post(chat, { draftId: "x", text: "evil" }, "https://evil.example"))
    .status === 403,
  "cross-site form POST refused"
);
check(
  (await post(chat, { draftId: "x", text: "evil" }, "")).status === 403,
  "POST without Origin refused"
);
check(
  (await post(`${chat}?__rsc_action_id=whatever`, {}, "https://evil.example"))
    .status === 403,
  "cross-site server function call refused"
);
check(
  (await post(`${admin}/bucket`, { asOfMs: "1" }, "https://evil.example"))
    .status === 403,
  "cross-site bucket delete refused"
);
check(
  (await staffLines()) === before + 2,
  "nothing kept from the refused POSTs"
);

// The bucket delete.
const badAsOf = await post(`${admin}/bucket`, { asOfMs: "abc" });
check(
  badAsOf.status === 400 && (await badAsOf.text()).includes("消せませんでした"),
  "invalid asOfMs refused (400)"
);
const atMs =
  (await html("/bucket")).match(/name="asOfMs" value="(\d+)"/)?.[1] ?? "";
const cleaned = await post(`${admin}/bucket`, { asOfMs: atMs });
check(
  cleaned.status === 200 && (await cleaned.text()).includes("に消しました"),
  "delete runs as of the audit shown"
);

// With JavaScript: the server function.
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const scripts: string[] = [];
page.on("response", (response) => {
  if (response.request().resourceType() === "script")
    scripts.push(response.url());
});
await page.goto(chat);
await page.waitForFunction(() => document.querySelector("form") !== null);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  (window as unknown as { marker: number }).marker = 1;
});
const jsBefore = await page.locator('[data-from="staff"]').count();
await page.fill("textarea", "   ");
await page.click("button[type=submit]");
await page.getByRole("alert").waitFor();
check(
  (await page.getByRole("alert").textContent()) === "返信を書いてください。",
  "JS: blank answer refused in the form"
);
check((await page.inputValue("textarea")) === "   ", "JS: refused words kept");
await page.fill("textarea", "JSありの返信です");
await page.click("button[type=submit]");
await page.locator('[data-from="staff"]').nth(jsBefore).waitFor();
check(
  await page.evaluate(
    () => (window as unknown as { marker?: number }).marker === 1
  ),
  "JS: answered without loading the page"
);
check(
  (await page.inputValue("textarea")) === "",
  "JS: a kept answer starts a new draft"
);

// An answer kept but lost on the way back, sent again from the same draft.
const countBefore = await staffLines();
await page.route("**/*__rsc_action_id*", async (route) => {
  await route.fetch();
  await route.abort();
});
await page.fill("textarea", "届いたが返事が失われた返信");
await page.click("button[type=submit]");
await page.getByRole("alert").waitFor();
check(
  (await page.getByRole("alert").textContent()) === "返信できませんでした。",
  "JS: a lost answer says so"
);
await page.unroute("**/*__rsc_action_id*");
await page.click("button[type=submit]");
await page.waitForFunction(
  () => document.querySelector('[role="alert"]') === null
);
check(
  (await staffLines()) === countBefore + 1,
  "JS: the resend after a lost answer is one line"
);
console.log(`scripts loaded on the chat page: ${scripts.length}`);
await browser.close();

console.log(failed === 0 ? "all passed" : `${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
