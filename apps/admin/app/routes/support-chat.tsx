import { textLimits } from "@pochical/design/limits";
import { characterCount, withinLimit } from "@pochical/design/text";
import { css, cx } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import {
  actions,
  alert,
  button,
  card,
  code,
  Crumbs,
  field,
  meta,
  page,
  PageHeader,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/support-chat";

// One user's chat a page at a time, as the app pages it: the latest, and
// earlier pages by 前のメッセージ (?before={seq}), oldest first, each of
// their lines with the app and device it came from, the line a reply is to,
// and the emoji on it; and a form to answer as ポチカル.
export const loader = async ({ params, url }: Route.LoaderArgs) => {
  const before = Number(url.searchParams.get("before"));
  const chat = await env.SERVER.supportChat(
    params.userId,
    Number.isInteger(before) && before > 0 ? before : 0
  );
  return { ...chat, draftId: crypto.randomUUID() };
};

/**
 * An answer's op id: the form's draft id with its words as the chat keeps
 * them, so the same words sent again from the same draft are one line,
 * with or without JavaScript, and other words are an answer of their own.
 */
const opIdOf = async (draftId: string, words: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${draftId}\n${words}`)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

export const action = async ({ params, request, url }: Route.ActionArgs) => {
  const form = await request.formData();
  const valueOf = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const text = valueOf("text");
  const draftId = valueOf("draftId");
  // The words and the draft go back with the error, so sending them again
  // is the same answer.
  const refuse = (status: number, error: string) =>
    data({ draftId, error, text }, { status });
  // The server keeps the words trimmed, and holds them to the limit so.
  const words = text.trim();
  if (words === "") {
    return refuse(400, "返信を書いてください。");
  }
  if (!withinLimit(words, textLimits.chatMessage)) {
    return refuse(
      400,
      `返信が長すぎます（${characterCount(words)}/${textLimits.chatMessage}文字）。`
    );
  }
  const kept = await env.SERVER.answerSupport(
    params.userId,
    text,
    await opIdOf(draftId, words)
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
  const navigation = useNavigation();
  const sending = navigation.state === "submitting";
  // Loading after the answer's POST is its redirect: the answer was kept.
  // One refused comes back without loading the page again.
  const keeping =
    navigation.state === "loading" && navigation.formMethod === "POST";
  // The draft outlives 前のメッセージ, which loads the page again, and
  // takes the page's new one once a kept answer has loaded it.
  const [draft, setDraft] = useState(() => ({
    id: actionData?.draftId ?? loaderData.draftId,
    keeping,
  }));
  if (draft.keeping !== keeping) {
    setDraft({ id: keeping ? draft.id : loaderData.draftId, keeping });
  }
  const draftId = draft.id;
  return (
    <main className={page}>
      <PageHeader
        crumbs={<Crumbs trail={[{ label: "サポート", to: "/" }]} />}
        title={<span className={code}>{userId.slice(0, 8)}</span>}
      />
      <div
        className={css({ display: "flex", flexDirection: "column", gap: "4" })}
      >
        {!atStart && earliest !== undefined && (
          <Link
            className={cx(
              button({ variant: "outline" }),
              css({ alignSelf: "center" })
            )}
            to={`?before=${earliest}`}
          >
            前のメッセージ
          </Link>
        )}
        {lines.map((line) => (
          <div
            className={css({
              alignItems: line.fromPochical ? "flex-end" : "flex-start",
              display: "flex",
              flexDirection: "column",
              gap: "1",
            })}
            key={line.seq}
          >
            <div className={meta}>
              {line.fromPochical ? "ポチカル" : "ユーザー"}・
              {when(line.sentAtMs)}
              {line.device === null ? "" : `・${line.device}`}
            </div>
            <div
              className={css({
                background: line.fromPochical ? "accent.fill" : "fill.tertiary",
                borderRadius: "lg",
                color: line.fromPochical ? "accent.onFill" : "text.primary",
                display: "flex",
                flexDirection: "column",
                gap: "2",
                maxWidth: "min(560px, 85%)",
                paddingBlock: "2.5",
                paddingInline: "3.5",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              })}
            >
              {line.replyTo !== null && (
                <div
                  className={css({
                    borderColor: "currentColor",
                    borderLeft: "2px solid",
                    fontSize: "xs",
                    opacity: 0.7,
                    paddingLeft: "2",
                  })}
                >
                  {quoteOf(bySeq.get(line.replyTo))}
                </div>
              )}
              {line.unsent && (
                <span className={css({ opacity: 0.6 })}>
                  送信が取り消されました
                </span>
              )}
              {line.photos.length > 0 && (
                <div
                  className={css({
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "1",
                  })}
                >
                  {line.photos.map((photo) => (
                    <a
                      href={`/photos/${userId}/${photo.id}`}
                      key={photo.id}
                      rel="noopener"
                      target="_blank"
                    >
                      <img
                        alt="写真"
                        className={css({
                          borderRadius: "sm",
                          display: "block",
                          height: "auto",
                          maxHeight: "260px",
                          maxWidth: "220px",
                          objectFit: "contain",
                          width: "auto",
                        })}
                        height={photo.height}
                        src={`/photos/${userId}/${photo.id}`}
                        width={photo.width}
                      />
                    </a>
                  ))}
                </div>
              )}
              {line.text === "" ? null : <div>{line.text}</div>}
              {line.preview !== null && (
                <div className={css({ fontSize: "xs", opacity: 0.8 })}>
                  <a
                    className={css({
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    })}
                    href={line.preview.url}
                    rel="noopener"
                    target="_blank"
                  >
                    {line.preview.title}（{line.preview.site}）
                  </a>
                </div>
              )}
            </div>
            {line.reactions.length > 0 && (
              <div
                className={css({ display: "flex", flexWrap: "wrap", gap: "1" })}
              >
                {line.reactions.map(({ emoji, mine, support }) => (
                  <span
                    className={css({
                      background: "background.base",
                      border: "1px solid",
                      borderColor: "border.default",
                      borderRadius: "full",
                      fontSize: "xs",
                      paddingInline: "2",
                    })}
                    key={emoji}
                  >
                    {`${emoji} ${[mine && "ユーザー", support && "ポチカル"].filter(Boolean).join("・")}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* The card is the field: it takes the ring as the words are written. */}
      <Form
        className={cx(
          card,
          css({
            _focusWithin: {
              borderColor: "accent.default",
              boxShadow: "0 0 0 3px var(--accent-container)",
            },
            padding: "3",
            transition: "border-color 120ms, box-shadow 120ms",
          })
        )}
        method="post"
      >
        <input name="draftId" type="hidden" value={draftId} />
        {/* A new draft starts empty. */}
        <textarea
          aria-label="返信"
          className={cx(
            field,
            css({
              _focusVisible: { boxShadow: "none" },
              background: "transparent",
              border: "none",
              paddingInline: "1",
              resize: "vertical",
            })
          )}
          defaultValue={
            actionData?.draftId === draftId ? actionData.text : undefined
          }
          key={draftId}
          name="text"
          placeholder="ポチカルとして返信"
          required
          rows={4}
        />
        <div className={cx(actions, css({ justifyContent: "flex-end" }))}>
          <button className={button()} disabled={sending} type="submit">
            返信する
          </button>
        </div>
      </Form>
      {actionData?.error !== undefined && (
        <p className={alert} role="alert">
          {actionData.error}
        </p>
      )}
    </main>
  );
}
