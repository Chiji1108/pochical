import { textLimits } from "@pochical/design/limits";
import { env } from "cloudflare:workers";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { when } from "../when";
import type { Route } from "./+types/support-chat";

// One user's chat a page at a time, as the app pages it: the latest, and
// earlier pages by 前のメッセージ (?before={seq}), oldest first, each of
// their lines with the app and device it came from, the line a reply is to,
// and the emoji on it; and a form to answer as ポチカル.
export const loader = async ({ params, url }: Route.LoaderArgs) => {
  const before = Number(url.searchParams.get("before"));
  const page = await env.SERVER.supportChat(
    params.userId,
    Number.isInteger(before) && before > 0 ? before : 0
  );
  return { ...page, draftId: crypto.randomUUID() };
};

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/**
 * An answer's op id: the form's draft id with its words, so the same words
 * sent again from the same form are one line, with or without JavaScript,
 * and other words are an answer of their own.
 */
const opIdOf = async (draftId: string, text: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${draftId}\n${text.trim()}`)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

export const action = async ({ params, request, url }: Route.ActionArgs) => {
  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const text = field("text");
  const draftId = field("draftId");
  // The words and the draft go back with the error, so sending them again
  // is the same answer.
  const refuse = (status: number, error: string) =>
    data({ draftId, error, text }, { status });
  if (text.trim() === "") {
    return refuse(400, "返信を書いてください。");
  }
  // Counted as the server counts it (spec/text-limits.md): characters as a
  // reader sees them.
  const count = [...graphemes.segment(text)].length;
  if (count > textLimits.chatMessage) {
    return refuse(
      400,
      `${textLimits.chatMessage}文字までです（${count}文字）。`
    );
  }
  const kept = await env.SERVER.answerSupport(
    params.userId,
    text,
    await opIdOf(draftId, text)
  ).catch(() => false);
  if (!kept) {
    return refuse(502, "返信できませんでした。");
  }
  // Post/Redirect/Get: reloading the page does not send it again. The
  // action gets the request as it came, a script's ending in .data, so the
  // redirect is built from React Router's normalized url.
  return redirect(url.pathname);
};

/** The line a reply is to, as its quote shows it. */
function quoteOf(line: { words: string; unsent: boolean } | undefined): string {
  if (line === undefined) {
    return "以前のメッセージ";
  }
  if (line.unsent) {
    return "取り消されたメッセージ";
  }
  return line.words.slice(0, 80);
}

export default function SupportChat({
  actionData,
  loaderData,
  params: { userId },
}: Route.ComponentProps) {
  const { lines, quoted, atStart } = loaderData;
  const bySeq = new Map([...quoted, ...lines].map((line) => [line.seq, line]));
  const earliest = lines[0]?.seq;
  const sending = useNavigation().state === "submitting";
  return (
    <main>
      <h1>サポート・{userId.slice(0, 8)}</h1>
      {!atStart && earliest !== undefined && (
        <Link to={`?before=${earliest}`}>前のメッセージ</Link>
      )}
      {lines.map((line) => (
        <div
          className="line"
          data-from={line.fromPochical ? "staff" : "user"}
          key={line.seq}
        >
          <div className="meta">
            {line.fromPochical ? "ポチカル" : "ユーザー"}・{when(line.sentAtMs)}
            {line.device === null ? "" : `・${line.device}`}
          </div>
          {line.replyTo !== null && (
            <div className="quote">{quoteOf(bySeq.get(line.replyTo))}</div>
          )}
          {line.unsent && <span className="meta">送信が取り消されました</span>}
          {line.photos.length > 0 && (
            <div className="photos">
              {line.photos.map((photo) => (
                <a
                  href={`/photos/${userId}/${photo.id}`}
                  key={photo.id}
                  rel="noopener"
                  target="_blank"
                >
                  <img
                    alt="写真"
                    className="photo"
                    height={photo.height}
                    src={`/photos/${userId}/${photo.id}`}
                    width={photo.width}
                  />
                </a>
              ))}
            </div>
          )}
          {line.text}
          {line.preview !== null && (
            <div className="meta">
              <a href={line.preview.url} rel="noopener" target="_blank">
                {line.preview.title}（{line.preview.site}）
              </a>
            </div>
          )}
          {line.reactions.length > 0 && (
            <div className="meta">
              {line.reactions
                .map(
                  ({ emoji, mine, support }) =>
                    `${emoji}${[mine && "ユーザー", support && "ポチカル"].filter(Boolean).join("・")}`
                )
                .join("　")}
            </div>
          )}
        </div>
      ))}
      {/* A kept answer loads the page again, and a new draft with it. */}
      <Form key={loaderData.draftId} method="post">
        <input
          defaultValue={actionData?.draftId ?? loaderData.draftId}
          name="draftId"
          type="hidden"
        />
        <textarea
          aria-label="返信"
          defaultValue={actionData?.text}
          name="text"
          required
          rows={4}
        />
        <button disabled={sending} type="submit">
          ポチカルとして返信
        </button>
        {actionData?.error !== undefined && (
          <p className="open" role="alert">
            {actionData.error}
          </p>
        )}
      </Form>
    </main>
  );
}
