import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";

import { Page } from "../components/site-layout";
import { pageMeta, site } from "../lib/site";

export const Route = createFileRoute("/account/delete")({
  component: DeleteAccount,
  head: () =>
    pageMeta(
      "アカウント削除",
      "ポチカルのアカウントと関連データの削除を、Webから依頼できます。",
      "/account/delete",
      true
    ),
});
function DeleteAccount() {
  return (
    <Page
      eyebrow="ACCOUNT DELETION"
      intro="アプリを消したあとでも、ここから依頼できます。"
      title="アカウントの削除"
    >
      <section className="deletion-explanation">
        <h2>削除されるもの</h2>
        <ul>
          <li>アカウント情報とログインの連携情報</li>
          <li>シフト、勤務パターン、メモなどの保存データ</li>
          <li>グループへの参加情報</li>
          <li>
            自分が送ったチャットの本文・写真・名前・返信の引用・リアクション
          </li>
          <li>ポチカルとのチャット（写真を含む）</li>
        </ul>
        <p>
          共有チャットには「削除済み」の表示が残ります。他の人が保存した画像やコピーは削除されません。Webでの手続きでは、オフライン端末内のデータを直接消去できません。利用していた端末でも、同期後にデータの削除を確認してください。
        </p>
        <p className="warning-text">
          削除は取り消せません。必要な予定は、手続き前に保存してください。
        </p>
      </section>
      <section className="deletion-panel">
        <Mail aria-hidden="true" size={24} />
        <h2>メールで削除を依頼する</h2>
        <p>
          アプリの設定からも削除できます。アプリを使えないときは、メールでご連絡ください。確認のうえ、削除します。
        </p>
        <a
          className="button"
          href={`mailto:${site.email}?subject=${encodeURIComponent("ポチカル アカウント削除の依頼")}`}
        >
          削除を依頼する
        </a>
        <p className="small-note">
          パスワードや、勤務先で扱う個人情報は送らないでください。
        </p>
      </section>
      <Link className="text-link" to="/privacy">
        データの取り扱いについて →
      </Link>
    </Page>
  );
}
