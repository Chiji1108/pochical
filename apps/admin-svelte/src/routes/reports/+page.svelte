<script lang="ts">
  import { when } from "#lib/when.ts";

  // What members reported, the latest first, with what they saw.
  let { data } = $props();

  const REASON_NAMES: Record<string, string> = {
    explicit: "性的・暴力的",
    harassment: "嫌がらせ",
    impersonation: "なりすまし",
    other: "その他",
    spam: "スパム",
  };
</script>

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
      {#each data.reports as report (`${report.atMs}-${report.reporterId}-${report.targetId}`)}
        <tr>
          <td>{when(report.atMs)}</td>
          <td>{REASON_NAMES[report.reason] ?? report.reason}</td>
          <td>{report.groupId.slice(0, 8)}</td>
          <td>{report.reporterId.slice(0, 8)}</td>
          <td>{report.targetId.slice(0, 8)}</td>
          <td><pre>{report.context}</pre></td>
        </tr>
      {/each}
    </tbody>
  </table>
</main>
