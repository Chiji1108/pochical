import { css } from "@pochical/styled-system/css";
import { env } from "cloudflare:workers";

import {
  badge,
  card,
  code,
  Empty,
  numeric,
  page,
  PageHeader,
  table,
} from "../ui";
import { when } from "../when";
import type { Route } from "./+types/reports";

const REASON_NAMES: Record<string, string> = {
  explicit: "性的・暴力的",
  harassment: "嫌がらせ",
  impersonation: "なりすまし",
  other: "その他",
  spam: "スパム",
};

// What members reported, the latest first, with what they saw.
export const loader = async () => await env.SERVER.reports();

export default function Reports({ loaderData: reports }: Route.ComponentProps) {
  return (
    <main className={page}>
      <PageHeader
        description="メンバーが通報したもの。新しい順です。"
        title="通報"
      />
      <div className={card}>
        {reports.length === 0 ? (
          <Empty>通報はまだありません。</Empty>
        ) : (
          <table className={table}>
            <thead>
              <tr>
                <th>日時</th>
                <th>理由</th>
                <th>グループ</th>
                <th>通報した人</th>
                <th>対象</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr
                  key={`${report.atMs}-${report.reporterId}-${report.targetId}`}
                >
                  <td className={css({ color: "text.tertiary" })}>
                    <span className={numeric}>{when(report.atMs)}</span>
                  </td>
                  <td>
                    <span className={badge({ tone: "danger" })}>
                      {REASON_NAMES[report.reason] ?? report.reason}
                    </span>
                  </td>
                  <td className={code}>{report.groupId.slice(0, 8)}</td>
                  <td className={code}>{report.reporterId.slice(0, 8)}</td>
                  <td className={code}>{report.targetId.slice(0, 8)}</td>
                  <td>
                    <pre
                      className={css({
                        background: "fill.quaternary",
                        borderRadius: "xs",
                        color: "text.secondary",
                        fontSize: "xs",
                        minWidth: "240px",
                        paddingBlock: "2",
                        paddingInline: "2.5",
                      })}
                    >
                      {report.context}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
