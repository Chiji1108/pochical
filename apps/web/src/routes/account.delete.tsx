import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Page } from "../components/site-layout";
import { pageMeta, site } from "../lib/site";

const DeletionClient = lazy(() => import("../components/deletion-client"));
export const Route = createFileRoute("/account/delete")({
  head: () =>
    pageMeta(
      "アカウント削除",
      "ポチカルのアカウントと関連データの削除を、Webから申請できます。",
      "/account/delete",
      true
    ),
  component: DeleteAccount,
});
const Loading = () => (
  <p aria-live="polite" className="loading-message">
    本人確認の準備をしています…
  </p>
);
function DeleteAccount() {
  return (
    <Page
      eyebrow="ACCOUNT DELETION"
      intro="アプリを再インストールせずに、ここから手続きできます。"
      title="アカウントの削除"
    >
      <section className="deletion-explanation">
        <h2>削除されるもの</h2>
        <ul>
          <li>アカウント情報とログインの連携情報</li>
          <li>シフト、勤務パターン、メモなどの保存データ</li>
          <li>グループへの参加情報</li>
          <li>自分が送ったチャットの本文・名前・返信の引用・リアクション</li>
        </ul>
        <p>
          共有チャットには「削除済み」の表示が残ります。他の人が保存した画像やコピーは削除されません。Webでの手続きでは、オフライン端末内のデータを直接消去できません。利用していた端末でも、同期後にデータの削除を確認してください。
        </p>
        <p className="warning-text">
          削除は取り消せません。必要な予定は、手続き前に保存してください。
        </p>
      </section>
      <section aria-label="本人確認と削除手続き" className="deletion-panel">
        <ClientOnly fallback={<Loading />}>
          <Suspense fallback={<Loading />}>
            <DeletionClient />
          </Suspense>
        </ClientOnly>
      </section>
      <section className="deletion-help">
        <h2>ログインできない・アカウントを連携していない場合</h2>
        <p>
          Apple・Googleと連携せずに使っている場合は、利用中のアプリの設定から削除できます。端末を使えない場合や本人確認ができない場合は、サポートへ削除をご相談ください。確認できる情報を伺い、対応します。
        </p>
        <a
          className="text-link"
          href={`mailto:${site.email}?subject=${encodeURIComponent("ポチカル アカウント削除の依頼")}`}
        >
          削除について問い合わせる →
        </a>
        <p className="small-note">
          パスワードや患者さんの情報は送らないでください。
        </p>
        <Link to="/privacy">データの取り扱いについて</Link>
      </section>
    </Page>
  );
}
