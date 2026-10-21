<script lang="ts">
  import { enhance } from "$app/forms";
  import { refreshAll } from "$app/navigation";
  import { when } from "#lib/when.ts";

  let { data, form } = $props();

  type Verdict = (typeof data.audit.rows)[number]["verdict"];

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

  const audit = $derived(data.audit);
  const total = $derived.by(() => {
    const sum = { bytes: 0, count: 0 };
    for (const { bytes, count } of audit.deletable) {
      sum.bytes += bytes;
      sum.count += count;
    }
    return sum;
  });
  let cleaning = $state(false);
  let running = $state(false);
  const busy = $derived(cleaning || running);
  let confirm: HTMLDialogElement;
</script>

<main>
  <h1>棚卸し</h1>
  <p class="meta">
    {`${when(audit.atMs)} 時点。Group DO ${audit.groupsAsked}、User DO ${audit.usersAsked} に聞きました。${audit.graceMs / 3_600_000} 時間以内に置かれたものは判定しません。棚卸しは読むだけです。`}
  </p>
  <p>
    {`どこからも指されないもの：${audit.orphans.count} 件、${sizeOf(audit.orphans.bytes)}`}
  </p>
  <div class="actions">
    <!-- Without JavaScript a GET to the same page runs the audit again; the
    client router would reuse the page's data, so it refreshes instead. -->
    <form
      method="GET"
      onsubmit={async (event) => {
        event.preventDefault();
        running = true;
        await refreshAll().finally(() => {
          running = false;
        });
      }}
    >
      <button disabled={busy} type="submit">再実行</button>
    </form>
    <button
      class="danger"
      command="show-modal"
      commandfor="confirm"
      disabled={busy || total.count === 0}
      type="button"
    >
      {`どこからも指されない ${total.count} 件（${sizeOf(total.bytes)}）を消す`}
    </button>
  </div>
  <dialog
    bind:this={confirm}
    id="confirm"
    oncancel={(event) => {
      if (cleaning) {
        event.preventDefault();
      }
    }}
  >
    <p>{`${total.count} 件（${sizeOf(total.bytes)}）を消します。元に戻せません。`}</p>
    <table>
      <thead>
        <tr><th>判定</th><th>件数</th><th>容量</th></tr>
      </thead>
      <tbody>
        {#each audit.deletable as { bytes, count, verdict } (verdict)}
          <tr>
            <td>{VERDICT_NAMES[verdict]}</td>
            <td>{count}</td>
            <td>{sizeOf(bytes)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="meta">
      {`${VERDICT_NAMES.unknown}と、${audit.graceMs / 3_600_000} 時間以内に置かれたものは残します。グループの写真と自分の写真は、消す前に持ち主にもう一度聞き、その間に使われたものは飛ばします。`}
    </p>
    <form
      class="actions"
      method="POST"
      action="?/clean"
      use:enhance={() => {
        cleaning = true;
        return async ({ update }) => {
          await update();
          cleaning = false;
          confirm.close();
        };
      }}
    >
      <input name="asOfMs" type="hidden" value={audit.atMs} />
      <button
        class="quiet"
        command="close"
        commandfor="confirm"
        disabled={cleaning}
        type="button"
      >
        キャンセル
      </button>
      <button class="danger" disabled={cleaning} type="submit">消す</button>
    </form>
  </dialog>
  {#if form?.failed}
    <p class="open">消せませんでした。</p>
  {/if}
  {#if form?.cleanup}
    <section>
      <h2>削除</h2>
      <p class="meta">{`${when(form.cleanup.atMs)} に消しました。失敗したものは、もう一度消すと消せます。`}</p>
      <table>
        <thead>
          <tr><th>判定</th><th>消した</th><th>飛ばした</th><th>失敗</th></tr>
        </thead>
        <tbody>
          {#each form.cleanup.rows as row (row.verdict)}
            <tr>
              <td>{VERDICT_NAMES[row.verdict]}</td>
              <td>{`${row.deleted.count} 件、${sizeOf(row.deleted.bytes)}`}</td>
              <td>{`${row.skipped.count} 件、${sizeOf(row.skipped.bytes)}`}</td>
              <td class={row.failed.count > 0 ? "open" : ""}>
                {`${row.failed.count} 件、${sizeOf(row.failed.bytes)}`}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
  <table>
    <thead>
      <tr><th>場所</th><th>判定</th><th>件数</th><th>容量</th><th>例</th></tr>
    </thead>
    <tbody>
      {#each audit.rows as row (`${row.prefix}-${row.verdict}`)}
        <tr>
          <td>{row.prefix === "" ? "その他" : row.prefix}</td>
          <td class={row.orphan ? "open" : ""}>{VERDICT_NAMES[row.verdict]}</td>
          <td>{row.count}</td>
          <td>{sizeOf(row.bytes)}</td>
          <td>
            {#if row.orphan}
              <details>
                <summary>{row.sample.length} 件</summary>
                <pre>{row.sample.join("\n")}</pre>
              </details>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</main>
