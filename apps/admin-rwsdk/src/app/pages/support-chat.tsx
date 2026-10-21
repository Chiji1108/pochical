import { env } from "cloudflare:workers";
import type { RequestInfo } from "rwsdk/worker";

import { when } from "../when";
import { answer } from "./answer";
import type { Draft } from "./answer";
import { AnswerForm } from "./answer-form";

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

// One user's chat a page at a time, as the app pages it: the latest, and
// earlier pages by 前のメッセージ (?before={seq}), oldest first, each of
// their lines with the app and device it came from, the line a reply is to,
// and the emoji on it; and a form to answer as ポチカル.
async function SupportChatPage({
  draft,
  request,
  userId,
}: {
  draft: Draft;
  request: Request;
  userId: string;
}) {
  const before = Number(new URL(request.url).searchParams.get("before"));
  const { lines, quoted, atStart } = await env.SERVER.supportChat(
    userId,
    Number.isInteger(before) && before > 0 ? before : 0
  );
  const bySeq = new Map([...quoted, ...lines].map((line) => [line.seq, line]));
  const earliest = lines[0]?.seq;
  return (
    <main>
      <h1>サポート・{userId.slice(0, 8)}</h1>
      {!atStart && earliest !== undefined && (
        <a href={`?before=${earliest}`}>前のメッセージ</a>
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
      <AnswerForm draft={draft} userId={userId} />
    </main>
  );
}

export const SupportChat = ({
  params,
  request,
}: RequestInfo<{ userId: string }>) => (
  <SupportChatPage
    draft={{ id: crypto.randomUUID(), text: "" }}
    request={request}
    userId={params.userId}
  />
);

export const postAnswer = async (info: RequestInfo<{ userId: string }>) => {
  // A server function's call comes as a POST to the page, the function run
  // already; it takes the page again.
  if (info.isAction) {
    return SupportChat(info);
  }
  const answered = await answer(
    info.params.userId,
    await info.request.formData()
  );
  if (answered.kept) {
    // Post/Redirect/Get: reloading the page does not send it again.
    return new Response(null, {
      headers: { Location: new URL(info.request.url).pathname },
      status: 303,
    });
  }
  info.response.status = answered.status;
  return (
    <SupportChatPage
      draft={answered.draft}
      request={info.request}
      userId={info.params.userId}
    />
  );
};
