import { env } from "cloudflare:workers";
import { data, Form, useNavigation } from "react-router";

import { when } from "../when";
import type { Route } from "./+types/bucket";

// The photos bucket held up against what names each object (棚卸し): run
// as the page loads, so again after 消す and on 再実行. Only 消す deletes.
export const loader = async () => await env.SERVER.bucketAudit();

export const action = async ({ request }: Route.ActionArgs) => {
  // As of the audit shown, so what passed the grace since stays.
  const form = await request.formData();
  const asOfMs = Number(form.get("asOfMs"));
  if (!Number.isInteger(asOfMs) || asOfMs <= 0) {
    return data({ failed: true as const }, { status: 400 });
  }
  return await env.SERVER.cleanBucket(asOfMs).then(
    (cleanup) => ({ cleanup }),
    () => data({ failed: true as const }, { status: 502 })
  );
};

// The audit runs again after 消す, whether it deleted or failed.
export const shouldRevalidate = () => true;

type Verdict = Route.ComponentProps["loaderData"]["rows"][number]["verdict"];

const VERDICT_NAMES: Record<Verdict, string> = {
  expired: "期限切れのキャッシュ",
  groupGone: "グループがない",
  notUsual: "いつもの写真ではない",
  recent: "新しいので判定しない",
  referenced: "使われている",
  sentUnnamed: "送信済みだが、どの行にもない",
  takenBack: "取り消し済み",
  unknown: "サーバーが書かないキー",
  unlinked: "どのプレビューにもない",
  unnoted: "グループに記録がない",
  userGone: "アカウントがない",
};

const sizeOf = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function BucketAudit({
  actionData,
  loaderData: audit,
}: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const cleaning = useNavigation().formMethod === "POST";
  const total = { bytes: 0, count: 0 };
  for (const { bytes, count } of audit.deletable) {
    total.bytes += bytes;
    total.count += count;
  }
  const cleanup =
    actionData !== undefined && "cleanup" in actionData
      ? actionData.cleanup
      : null;
  return (
    <main>
      <h1>棚卸し</h1>
      <p className="meta">
        {`${when(audit.atMs)} 時点。Group DO ${audit.groupsAsked}、User DO ${audit.usersAsked} に聞きました。${audit.graceMs / 3_600_000} 時間以内に置かれたものは判定しません。棚卸しは読むだけです。`}
      </p>
      <p>
        {`どこからも指されないもの：${audit.orphans.count} 件、${sizeOf(audit.orphans.bytes)}`}
      </p>
      <div className="actions">
        {/* A GET of the page is the audit again, with or without JavaScript. */}
        <Form method="get">
          <button disabled={busy} type="submit">
            再実行
          </button>
        </Form>
        <button
          className="danger"
          command="show-modal"
          commandfor="confirm"
          disabled={busy || total.count === 0}
          type="button"
        >
          {`どこからも指されない ${total.count} 件（${sizeOf(total.bytes)}）を消す`}
        </button>
      </div>
      {/* Each audit closes the dialog: a new one starts closed. */}
      <dialog
        id="confirm"
        key={audit.atMs}
        onCancel={(event) => {
          if (cleaning) {
            event.preventDefault();
          }
        }}
      >
        <p>{`${total.count} 件（${sizeOf(total.bytes)}）を消します。元に戻せません。`}</p>
        <table>
          <thead>
            <tr>
              <th>判定</th>
              <th>件数</th>
              <th>容量</th>
            </tr>
          </thead>
          <tbody>
            {audit.deletable.map(({ bytes, count, verdict }) => (
              <tr key={verdict}>
                <td>{VERDICT_NAMES[verdict]}</td>
                <td>{count}</td>
                <td>{sizeOf(bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta">
          {`${VERDICT_NAMES.unknown}と、${audit.graceMs / 3_600_000} 時間以内に置かれたものは残します。グループの写真と自分の写真は、消す前に持ち主にもう一度聞き、その間に使われたものは飛ばします。`}
        </p>
        <Form className="actions" method="post">
          <input name="asOfMs" type="hidden" value={audit.atMs} />
          <button
            className="quiet"
            command="close"
            commandfor="confirm"
            disabled={cleaning}
            type="button"
          >
            キャンセル
          </button>
          <button className="danger" disabled={cleaning} type="submit">
            消す
          </button>
        </Form>
      </dialog>
      {actionData !== undefined && "failed" in actionData && (
        <p className="open">消せませんでした。</p>
      )}
      {cleanup !== null && (
        <section>
          <h2>削除</h2>
          <p className="meta">{`${when(cleanup.atMs)} に消しました。失敗したものは、もう一度消すと消せます。`}</p>
          <table>
            <thead>
              <tr>
                <th>判定</th>
                <th>消した</th>
                <th>飛ばした</th>
                <th>失敗</th>
              </tr>
            </thead>
            <tbody>
              {cleanup.rows.map((row) => (
                <tr key={row.verdict}>
                  <td>{VERDICT_NAMES[row.verdict]}</td>
                  <td>{`${row.deleted.count} 件、${sizeOf(row.deleted.bytes)}`}</td>
                  <td>{`${row.skipped.count} 件、${sizeOf(row.skipped.bytes)}`}</td>
                  <td className={row.failed.count > 0 ? "open" : ""}>
                    {`${row.failed.count} 件、${sizeOf(row.failed.bytes)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <table>
        <thead>
          <tr>
            <th>場所</th>
            <th>判定</th>
            <th>件数</th>
            <th>容量</th>
            <th>例</th>
          </tr>
        </thead>
        <tbody>
          {audit.rows.map((row) => (
            <tr key={`${row.prefix}-${row.verdict}`}>
              <td>{row.prefix === "" ? "その他" : row.prefix}</td>
              <td className={row.orphan ? "open" : ""}>
                {VERDICT_NAMES[row.verdict]}
              </td>
              <td>{row.count}</td>
              <td>{sizeOf(row.bytes)}</td>
              <td>
                {row.orphan ? (
                  <details>
                    <summary>{row.sample.length} 件</summary>
                    <pre>{row.sample.join("\n")}</pre>
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
