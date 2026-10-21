import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { getBucketAudit, when } from "../admin";

const VERDICT_NAMES: Record<string, string> = {
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

const KEPT = new Set(["referenced", "recent"]);

const sizeOf = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// The photos bucket held up against what names each object (棚卸し): run
// as the page opens and again by 再実行. It only reads.
export const Route = createFileRoute("/bucket")({
  component: BucketAudit,
  loader: async () => await getBucketAudit(),
});

function BucketAudit() {
  const audit = Route.useLoaderData();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const orphans = audit.rows.filter((row) => !KEPT.has(row.verdict));
  const rerun = async () => {
    setRunning(true);
    await router.invalidate();
    setRunning(false);
  };
  return (
    <main>
      <h1>棚卸し</h1>
      <p className="meta">
        {`${when(audit.atMs)} 時点。グループ ${audit.groups}、ユーザー ${audit.users}。${audit.graceMs / 3_600_000} 時間以内に置かれたものは判定しません。何も消しません。`}
      </p>
      <p>
        {`どこからも指されないもの：${orphans.reduce((sum, row) => sum + row.count, 0)} 件、${sizeOf(orphans.reduce((sum, row) => sum + row.bytes, 0))}`}
      </p>
      <button
        disabled={running}
        onClick={() => {
          void rerun();
        }}
        type="button"
      >
        再実行
      </button>
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
              <td className={KEPT.has(row.verdict) ? "" : "open"}>
                {VERDICT_NAMES[row.verdict] ?? row.verdict}
              </td>
              <td>{row.count}</td>
              <td>{sizeOf(row.bytes)}</td>
              <td>
                {KEPT.has(row.verdict) ? null : (
                  <details>
                    <summary>{row.sample.length} 件</summary>
                    <pre>{row.sample.join("\n")}</pre>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
