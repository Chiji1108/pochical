import { env } from "cloudflare:workers";
import { data, Form, useNavigation } from "react-router";

import { sizeOf } from "../size";
import type { Route } from "./+types/reset";

// Everything erased before release (全消去): what it erases, read as the
// page loads; the word typed to confirm it; and what is left after. To be
// removed before release (POC-155).
export const loader = async () => await env.SERVER.resetPreview();

/** What is typed to confirm: nothing is erased by a press alone. */
const WORD = "全消去";

export const action = async ({ request }: Route.ActionArgs) => {
  const form = await request.formData();
  if (form.get("confirm") !== WORD) {
    return data({ error: `「${WORD}」と入力してください。` }, { status: 400 });
  }
  return await env.SERVER.reset().then(
    (left) => ({ left }),
    () =>
      data(
        {
          error:
            "途中で止まりました。もう一度実行すると、残ったものを消します。",
        },
        { status: 502 }
      )
  );
};

type Preview = Route.ComponentProps["loaderData"];

function Counts({ preview }: { preview: Preview }) {
  return (
    <table>
      <tbody>
        <tr>
          <th>ユーザー</th>
          <td>{`${preview.users} 人（うち匿名 ${preview.anonymous} 人）`}</td>
        </tr>
        <tr>
          <th>グループ</th>
          <td>{preview.groups}</td>
        </tr>
        <tr>
          <th>サポートのチャット</th>
          <td>{preview.supportChats}</td>
        </tr>
        <tr>
          <th>通報</th>
          <td>{preview.reports}</td>
        </tr>
        <tr>
          <th>写真バケット</th>
          <td>{`${preview.objects.count} 件、${sizeOf(preview.objects.bytes)}`}</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function Reset({
  actionData,
  loaderData: preview,
}: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main>
      <h1>全消去</h1>
      <p className="alert">
        リリース前だけのものです。すべてのアカウント、グループ、チャット、通報、写真をサーバーから消します。元に戻せません。
      </p>
      <h2>消すもの</h2>
      <Counts preview={preview} />
      <p className="meta">
        アカウントは、アカウントの削除と同じ手順で消します。Apple
        のトークンは取り消しません（取り消しには本人の新しい認可コードが要ります）。同じ
        Apple ID
        でもう一度ログインすると、新しいユーザーになります。端末に残ったセッションは使えなくなります。
      </p>
      <Form method="post">
        <label htmlFor="confirm">{`確認のため「${WORD}」と入力してください`}</label>
        <input
          autoComplete="off"
          id="confirm"
          name="confirm"
          pattern={WORD}
          required
          type="text"
        />
        <button className="danger" disabled={busy} type="submit">
          すべて消す
        </button>
      </Form>
      {actionData !== undefined && "error" in actionData && (
        <p className="open" role="alert">
          {actionData.error}
        </p>
      )}
      {actionData !== undefined && "left" in actionData && (
        <section>
          <h2>消しました。残っているもの</h2>
          <Counts preview={actionData.left} />
        </section>
      )}
    </main>
  );
}
