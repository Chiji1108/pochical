<script lang="ts">
  import { textLimits } from "@pochical/design/limits";
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  import { when } from "#lib/when.ts";

  let { data, form } = $props();

  const userId = $derived(page.params.userId ?? "");
  const bySeq = $derived(
    new Map([...data.quoted, ...data.lines].map((line) => [line.seq, line]))
  );
  const earliest = $derived(data.lines[0]?.seq);

  // The answer's own id, made again as the words change (but while it is
  // being sent) and once it is kept, so sending it again is one line. Both
  // follow what the action answered: a failure gives back the same words and
  // id, a success clears the words, and the reloaded page brings a fresh id.
  let draft = $derived(form?.text ?? "");
  let opId = $derived(form?.opId ?? data.opId);
  let sending = $state(false);

  const quoteOf = (seq: number) => {
    const line = bySeq.get(seq);
    if (line === undefined) {
      return "以前のメッセージ";
    }
    return line.unsent ? "取り消されたメッセージ" : line.words.slice(0, 80);
  };
</script>

<main>
  <h1>サポート・{userId.slice(0, 8)}</h1>
  {#if !data.atStart && earliest !== undefined}
    <a href="?before={earliest}">前のメッセージ</a>
  {/if}
  {#each data.lines as line (line.seq)}
    <div class="line" data-from={line.fromPochical ? "staff" : "user"}>
      <div class="meta">
        {line.fromPochical ? "ポチカル" : "ユーザー"}・{when(line.sentAtMs)}{line.device ===
        null
          ? ""
          : `・${line.device}`}
      </div>
      {#if line.replyTo !== null}
        <div class="quote">{quoteOf(line.replyTo)}</div>
      {/if}
      {#if line.unsent}
        <span class="meta">送信が取り消されました</span>
      {/if}
      {#if line.photos.length > 0}
        <div class="photos">
          {#each line.photos as photo (photo.id)}
            <a
              href="/photos/{userId}/{photo.id}"
              rel="noopener"
              target="_blank"
              data-sveltekit-reload
            >
              <img
                alt="写真"
                class="photo"
                height={photo.height}
                src="/photos/{userId}/{photo.id}"
                width={photo.width}
              />
            </a>
          {/each}
        </div>
      {/if}
      {line.text}
      {#if line.preview !== null}
        <div class="meta">
          <a href={line.preview.url} rel="noopener" target="_blank">
            {line.preview.title}（{line.preview.site}）
          </a>
        </div>
      {/if}
      {#if line.reactions.length > 0}
        <div class="meta">
          {line.reactions
            .map(
              ({ emoji, mine, support }) =>
                `${emoji}${[mine && "ユーザー", support && "ポチカル"].filter(Boolean).join("・")}`
            )
            .join("　")}
        </div>
      {/if}
    </div>
  {/each}
  <form
    method="POST"
    action="?/answer"
    use:enhance={() => {
      sending = true;
      return async ({ update }) => {
        await update();
        sending = false;
      };
    }}
  >
    <input name="opId" type="hidden" value={opId} />
    <textarea
      aria-label="返信"
      maxlength={textLimits.chatMessage}
      name="text"
      oninput={() => {
        // Kept while a send is on its way: it may have arrived, and its
        // retry must be the same answer.
        if (!sending) {
          opId = crypto.randomUUID();
        }
      }}
      rows={4}
      bind:value={draft}
    ></textarea>
    <button disabled={sending} type="submit">ポチカルとして返信</button>
    {#if form?.error}
      <p class="open" role="alert">{form.error}</p>
    {/if}
  </form>
</main>
