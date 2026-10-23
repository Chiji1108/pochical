import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";
import { data, Form, useNavigation } from "react-router";
import type { ShouldRevalidateFunctionArgs } from "react-router";

import { sizeOf } from "../size";
import { staffOf } from "../staff";
import {
  alert,
  button,
  card,
  cardStyle,
  fieldStyle,
  label,
  meta,
  numeric,
  page,
  PageHeader,
  sectionTitle,
  table,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/reset";

// Everything erased before release (全消去): what the server holds, read
// as the page loads and again after each run, so what a run left; and the
// word typed to confirm it. To be removed before release (POC-155).
export const loader = async () => await env.SERVER.resetPreview();

/** What is typed to confirm: nothing is erased by a press alone. */
const WORD = "全消去";

export const action = async ({ request }: Route.ActionArgs) => {
  const form = await request.formData();
  if (form.get("confirm") !== WORD) {
    return data({ error: `「${WORD}」と入力してください。` }, { status: 400 });
  }
  return await env.SERVER.reset(staffOf(request)).then(
    () => ({ doneAtMs: Date.now() }),
    (error: unknown) => {
      console.error("全消去 stopped part way", error);
      return data(
        {
          error:
            "途中で止まりました。もう一度実行すると、残ったものを消します。",
        },
        { status: 502 }
      );
    }
  );
};

// What is held is read again after a run, whether it finished or stopped
// part way; not after a word refused before anything ran.
export const shouldRevalidate = ({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) =>
  actionStatus === 502 || defaultShouldRevalidate;

export default function Reset({
  actionData,
  loaderData: preview,
}: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className={page}>
      <PageHeader description="リリース前だけのものです。" title="全消去" />
      <p className={alert}>
        すべてのアカウント、グループ、チャット、通報、写真をサーバーから消します。元に戻せません。
      </p>
      <section
        className={css({ display: "flex", flexDirection: "column", gap: "3" })}
      >
        <h2 className={sectionTitle}>サーバーにあるもの</h2>
        <div className={card}>
          <table className={table}>
            <tbody>
              <tr>
                <th>ユーザー</th>
                <td
                  className={numeric}
                >{`${preview.users} 人（うち匿名 ${preview.anonymous} 人）`}</td>
              </tr>
              <tr>
                <th>グループ</th>
                <td className={numeric}>{preview.groups}</td>
              </tr>
              <tr>
                <th>サポートのチャット</th>
                <td className={numeric}>{preview.supportChats}</td>
              </tr>
              <tr>
                <th>通報</th>
                <td className={numeric}>{preview.reports}</td>
              </tr>
              <tr>
                <th>写真バケット</th>
                <td
                  className={numeric}
                >{`${preview.objects.count} 件、${sizeOf(preview.objects.bytes)}`}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={meta}>
          アカウントは、アカウントの削除と同じ手順で消します。Apple
          のトークンは取り消しません（取り消しには本人の新しい認可コードが要ります）。同じ
          Apple ID や Google アカウント
          でもう一度ログインすると、新しいユーザーになります。端末に残ったセッションは使えなくなります。
        </p>
      </section>
      <Form
        className={css(cardStyle, {
          borderColor:
            "color-mix(in srgb, var(--danger-default) 35%, transparent)",
          display: "flex",
          flexDirection: "column",
          gap: "3",
          padding: "5",
        })}
        method="post"
      >
        <div>
          <label
            className={label}
            htmlFor="confirm"
          >{`確認のため「${WORD}」と入力してください`}</label>
          <input
            autoComplete="off"
            className={css(fieldStyle, { maxWidth: "320px" })}
            id="confirm"
            name="confirm"
            pattern={WORD}
            required
            type="text"
          />
        </div>
        <div>
          <button
            className={button({ variant: "danger" })}
            disabled={busy}
            type="submit"
          >
            すべて消す
          </button>
        </div>
      </Form>
      {actionData !== undefined && "error" in actionData && (
        <p className={alert} role="alert">
          {actionData.error}
        </p>
      )}
      {actionData !== undefined && "doneAtMs" in actionData && (
        <p>{`${when(actionData.doneAtMs)} に消しました。残っているものは上のとおりです。`}</p>
      )}
    </main>
  );
}
