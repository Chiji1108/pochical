"use client";

import { useState, useTransition } from "react";

import { answer } from "./answer";
import type { Draft } from "./answer";

/**
 * The form to answer as ポチカル. Without JavaScript it posts to the page;
 * with it, it calls the answer as a server function and keeps the page.
 */
export function AnswerForm({
  draft: first,
  userId,
}: {
  draft: Draft;
  userId: string;
}) {
  const [draft, setDraft] = useState(first);
  const [sending, startSending] = useTransition();
  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startSending(async () => {
          const answered = await answer(userId, form).catch(
            (): Awaited<ReturnType<typeof answer>> => ({
              draft: { ...draft, error: "返信できませんでした。" },
              kept: false,
              status: 502,
            })
          );
          setDraft(
            answered.kept
              ? { id: crypto.randomUUID(), text: "" }
              : answered.draft
          );
        });
      }}
    >
      <input name="draftId" type="hidden" value={draft.id} />
      {/* A new draft starts empty. */}
      <textarea
        aria-label="返信"
        defaultValue={draft.text}
        key={draft.id}
        name="text"
        required
        rows={4}
      />
      <button disabled={sending} type="submit">
        ポチカルとして返信
      </button>
      {draft.error !== undefined && (
        <p className="open" role="alert">
          {draft.error}
        </p>
      )}
    </form>
  );
}
