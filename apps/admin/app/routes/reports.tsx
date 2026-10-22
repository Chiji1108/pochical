import { env } from "cloudflare:workers";
import { data, redirect } from "react-router";

import { ReportTable } from "../report-table";
import { staffOf } from "../staff";
import { alert, page, PageHeader } from "../ui";
import type { Route } from "./+types/reports";

// What members reported, those waiting first, then the latest, with what
// they saw and where each stands.
export const loader = async () => await env.SERVER.reports();

// A report's state and note, set by whoever Access let in (spec/admin.md,
// 通報), then the page again (Post/Redirect/Get), so reloading it sends
// nothing.
export const action = async ({ request, url }: Route.ActionArgs) => {
  const form = await request.formData();
  const value = (name: string) => {
    const got = form.get(name);
    return typeof got === "string" ? got : "";
  };
  const kept = await env.SERVER.handleReport(
    value("reportId"),
    value("state"),
    value("note"),
    staffOf(request)
  ).catch(() => false);
  return kept
    ? redirect(url.pathname)
    : data(
        {
          error: "保存できませんでした。メモが長すぎないか確かめてください。",
        },
        { status: 400 }
      );
};

export default function Reports({
  actionData,
  loaderData: reports,
}: Route.ComponentProps) {
  const waiting = reports.filter((report) => report.state === "open").length;
  return (
    <main className={page}>
      <PageHeader
        description={`メンバーが通報したもの。未対応を上に、新しい順です。未対応 ${waiting} 件。`}
        title="通報"
      />
      {actionData !== undefined && "error" in actionData && (
        <p className={alert} role="alert">
          {actionData.error}
        </p>
      )}
      <ReportTable empty="通報はまだありません。" handling reports={reports} />
    </main>
  );
}
