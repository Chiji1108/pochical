import { css } from "@pochical/styled-system/css";
import { Link } from "react-router";

import { badge, card, code, Empty, numeric, table } from "./ui";
import { when } from "./when";

const REASON_NAMES: Record<string, string> = {
  explicit: "性的・暴力的",
  harassment: "嫌がらせ",
  impersonation: "なりすまし",
  other: "その他",
  spam: "スパム",
};

type Report = {
  atMs: number;
  reason: string;
  groupId: string;
  reporterId: string;
  targetId: string;
  context: string;
};

const userLink = css({
  _hover: { textDecoration: "underline" },
  color: "accent.default",
});

/** A member, by the start of their id, to their page. */
function UserLink({ userId }: { userId: string }) {
  return (
    <Link className={userLink} to={`/users/${userId}`}>
      {userId.slice(0, 8)}
    </Link>
  );
}

/**
 * Reports, the latest first, with what each saw: the 通報 page's, and a
 * user's page's of what they reported and what was reported of them.
 */
export function ReportTable({
  empty,
  reports,
}: {
  empty: string;
  reports: Report[];
}) {
  return (
    <div className={card}>
      {reports.length === 0 ? (
        <Empty>{empty}</Empty>
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
                <td className={code}>
                  <UserLink userId={report.reporterId} />
                </td>
                <td className={code}>
                  <UserLink userId={report.targetId} />
                </td>
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
  );
}
