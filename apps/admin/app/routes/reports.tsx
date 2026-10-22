import { env } from "cloudflare:workers";

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
    <main>
      <h1>通報</h1>
      <table>
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
            <tr key={`${report.atMs}-${report.reporterId}-${report.targetId}`}>
              <td>{when(report.atMs)}</td>
              <td>{REASON_NAMES[report.reason] ?? report.reason}</td>
              <td>{report.groupId.slice(0, 8)}</td>
              <td>{report.reporterId.slice(0, 8)}</td>
              <td>{report.targetId.slice(0, 8)}</td>
              <td>
                <pre>{report.context}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
