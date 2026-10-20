import { textLimits } from "@pochical/design/limits";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { answerSupport, getSupportChat, when } from "../admin";

// One user's chat a page at a time, as the app pages it: the latest, and
// earlier pages by 前のメッセージ, oldest first, each of their lines with
// the app and device it came from, the line a reply is to, and the emoji
// on it; and a form to answer as ポチカル.
export const Route = createFileRoute("/support/$userId")({
  component: SupportChat,
  loader: async ({ params, deps }) =>
    await getSupportChat({
      data: { before: deps.before, userId: params.userId },
    }),
  loaderDeps: ({ search }: { search: { before?: number } }) => ({
    before: search.before ?? 0,
  }),
  // The page before this line, by its seq; none for the latest.
  validateSearch: (search: Record<string, unknown>): { before?: number } => {
    const before = Number(search.before);
    return Number.isInteger(before) && before > 0 ? { before } : {};
  },
});

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

function SupportChat() {
  const { lines, quoted, atStart } = Route.useLoaderData();
  const bySeq = new Map([...quoted, ...lines].map((line) => [line.seq, line]));
  const earliest = lines[0]?.seq;
  const { userId } = Route.useParams();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  // The answer's own id, made again as the words change (but while it is
  // being sent) and once it is kept, so sending it again is one line.
  const [opId, setOpId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    setSending(true);
    const kept = await answerSupport({
      data: { opId, text: draft, userId },
    }).catch(() => false);
    setSending(false);
    setFailed(!kept);
    if (kept) {
      setDraft("");
      setOpId(crypto.randomUUID());
      await router.invalidate();
    }
  };
  return (
    <main>
      <h1>サポート・{userId.slice(0, 8)}</h1>
      {!atStart && earliest !== undefined && (
        <Link
          params={{ userId }}
          search={{ before: earliest }}
          to="/support/$userId"
        >
          前のメッセージ
        </Link>
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="返信"
          maxLength={textLimits.chatMessage}
          onChange={(event) => {
            setDraft(event.target.value);
            // Kept while a send is on its way: it may have arrived, and its
            // retry must be the same answer.
            if (!sending) {
              setOpId(crypto.randomUUID());
            }
          }}
          rows={4}
          value={draft}
        />
        <button disabled={sending || draft.trim() === ""} type="submit">
          ポチカルとして返信
        </button>
        {failed && <p className="open">返信できませんでした。</p>}
      </form>
    </main>
  );
}
