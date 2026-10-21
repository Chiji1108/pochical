<script lang="ts">
  import { when } from "#lib/when.ts";

  // Every user's chat, the latest first, the ones waiting for an answer said.
  let { data } = $props();

  const failures = $derived(
    data.chats.flatMap((chat) => chat.slackFailure ?? [])
  );
  const since = $derived(
    Math.min(...failures.map((failure) => failure.sinceMs))
  );
  const whys = $derived([...new Set(failures.map((failure) => failure.why))]);
</script>

<main>
  <h1>サポート</h1>
  {#if failures.length > 0}
    <p class="alert" role="alert">
      {`${when(since)} から、${failures.length}件のチャットの行が Slack に届いていません（${whys.join("、")}）。ここでは読んで返信できます。Slack が受け取るようになると、待っている行を順に送ります。`}
    </p>
  {/if}
  <table>
    <thead>
      <tr>
        <th>最新</th>
        <th>ユーザー</th>
        <th>最新の行</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      {#each data.chats as chat (chat.userId)}
        <tr>
          <td>{when(chat.lastAtMs)}</td>
          <td><a href="/support/{chat.userId}">{chat.userId.slice(0, 8)}</a></td>
          <td>{chat.unsent ? "（送信取消）" : chat.text.slice(0, 80)}</td>
          <td>
            {#if chat.unanswered === 0}
              返信済み
            {:else}
              <span class="open">未返信（{chat.unanswered}）</span>
            {/if}
            {#if chat.slackFailure !== null}
              <div class="meta">Slack未送信</div>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</main>
