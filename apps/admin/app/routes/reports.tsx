import { env } from "cloudflare:workers";

import { ReportTable } from "../report-table";
import { page, PageHeader } from "../ui";
import type { Route } from "./+types/reports";

// What members reported, the latest first, with what they saw.
export const loader = async () => await env.SERVER.reports();

export default function Reports({ loaderData: reports }: Route.ComponentProps) {
  return (
    <main className={page}>
      <PageHeader
        description="メンバーが通報したもの。新しい順です。"
        title="通報"
      />
      <ReportTable empty="通報はまだありません。" reports={reports} />
    </main>
  );
}
