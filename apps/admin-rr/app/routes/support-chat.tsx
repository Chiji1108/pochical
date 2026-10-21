import { textLimits } from "@pochical/design/limits";
import { env } from "cloudflare:workers";
import { useRef } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { when } from "../when";
import type { Route } from "./+types/support-chat";

// One user's chat a page at a time, as the app pages it: the latest, and
// earlier pages by 前のメッセージ (?before={seq}), oldest first, each of
// their lines with the app and device it came from, the line a reply is to,
// and the emoji on it; and a form to answer as ポチカル. Each load hands
// out a fresh op id, so an answer sent twice, with or without JavaScript,
// is one line.
export const loader = async ({ params, url }: Route.LoaderArgs) => {
  const before = Number(url.searchParams.get("before"));
  const page = await env.SERVER.supportChat(
    params.userId,
    Number.isInteger(before) && before > 0 ? before : 0
  );
  return { ...page, opId: crypto.randomUUID() };
};

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

export const action = async ({ params, request, url }: Route.ActionArgs) => {
  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const text = field("text");
  const opId = field("opId");
  // Words and op id go back with the error, so sending again is the same
  // answer; a 4xx/5xx answer leaves the page's data as it is.
  const refuse = (status: number, error: string) =>
    data({ error, opId, text }, { status });
  if (text.trim() === "") {
    return refuse(400, "返信を書いてください。");
  }
  const count = [...graphemes.segment(text)].length;
  if (count > textLimits.chatMessage) {
    return refuse(
      400,
      `${textLimits.chatMessage}文字までです（${count}文字）。`
    );
  }
  const kept = await env.SERVER.answerSupport(params.userId, text, opId).catch(
    () => false
  );
  if (!kept) {
    return refuse(502, "返信できませんでした。");
  }
  // Post/Redirect/Get: reloading the page does not send it again.
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
  const opId = useRef<HTMLInputElement>(null);
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
      {/* A new op id from the loader (an answer kept) starts a new form. */}
      <Form key={loaderData.opId} method="post">
        <input
          defaultValue={actionData?.opId ?? loaderData.opId}
          name="opId"
          ref={opId}
          type="hidden"
        />
        <textarea
          aria-label="返信"
          defaultValue={actionData?.text}
          maxLength={textLimits.chatMessage}
          name="text"
          onChange={() => {
            // Kept while a send is on its way: it may have arrived, and its
            // retry must be the same answer.
            if (!sending && opId.current !== null) {
              opId.current.value = crypto.randomUUID();
            }
          }}
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
