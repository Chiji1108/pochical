import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { cleanBucket, getBucketAudit, when } from "../admin";

type Verdict = Awaited<
  ReturnType<typeof getBucketAudit>
>["rows"][number]["verdict"];

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

type Cleanup = Awaited<ReturnType<typeof cleanBucket>>;

type Weight = Cleanup["rows"][number]["deleted"];

// The photos bucket held up against what names each object (棚卸し): run
// as the page opens and again by 再実行. Only 消す deletes.
export const Route = createFileRoute("/bucket")({
  component: BucketAudit,
  loader: async () => await getBucketAudit(),
});

function BucketAudit() {
  const audit = Route.useLoaderData();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanup, setCleanup] = useState<Cleanup | "failed" | null>(null);
  const confirm = useRef<HTMLDialogElement>(null);
  // What 消す will delete, by verdict across every prefix: the server
  // leaves the keys it does not write.
  const deletable = new Map<Verdict, Weight>();
  const total: Weight = { bytes: 0, count: 0 };
  for (const row of audit.rows) {
    if (row.orphan && row.verdict !== "unknown") {
      const weight = deletable.get(row.verdict) ?? { bytes: 0, count: 0 };
      weight.bytes += row.bytes;
      weight.count += row.count;
      deletable.set(row.verdict, weight);
      total.bytes += row.bytes;
      total.count += row.count;
    }
  }
  const rerun = async () => {
    setRunning(true);
    await router.invalidate().finally(() => {
      setRunning(false);
    });
  };
  const clean = async () => {
    setCleaning(true);
    const result = await cleanBucket().catch(() => "failed" as const);
    setCleaning(false);
    confirm.current?.close();
    setCleanup(result);
    await rerun();
  };
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
        <button
          disabled={running || cleaning}
          onClick={() => {
            void rerun();
          }}
          type="button"
        >
          再実行
        </button>
        <button
          className="danger"
          disabled={running || cleaning || total.count === 0}
          onClick={() => {
            confirm.current?.showModal();
          }}
          type="button"
        >
          {`どこからも指されない ${total.count} 件（${sizeOf(total.bytes)}）を消す`}
        </button>
      </div>
      <dialog
        onCancel={(event) => {
          if (cleaning) {
            event.preventDefault();
          }
        }}
        ref={confirm}
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
            {[...deletable].map(([verdict, weight]) => (
              <tr key={verdict}>
                <td>{VERDICT_NAMES[verdict]}</td>
                <td>{weight.count}</td>
                <td>{sizeOf(weight.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta">
          {`${VERDICT_NAMES.unknown}と、${audit.graceMs / 3_600_000} 時間以内に置かれたものは残します。消す前に持ち主にもう一度聞き、その間に使われたものは飛ばします。`}
        </p>
        <div className="actions">
          <button
            className="quiet"
            disabled={cleaning}
            onClick={() => {
              confirm.current?.close();
            }}
            type="button"
          >
            キャンセル
          </button>
          <button
            className="danger"
            disabled={cleaning}
            onClick={() => {
              void clean();
            }}
            type="button"
          >
            消す
          </button>
        </div>
      </dialog>
      {cleanup === "failed" && <p className="open">消せませんでした。</p>}
      {cleanup !== null && cleanup !== "failed" && (
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
