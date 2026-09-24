import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus } from "lucide-react";
import { Page } from "../components/site-layout";
import { pageMeta, site } from "../lib/site";

export const Route = createFileRoute("/support")({
  head: () =>
    pageMeta(
      "サポート",
      "ポチカレのよくある質問とお問い合わせ窓口。",
      "/support"
    ),
  component: Support,
});
const questions = [
  {
    question: "アプリはどこからダウンロードできますか？",
    answer:
      "現在、App Store・Google Playでの公開を準備しています。公開後は、このサイトからダウンロードできます。",
  },
  {
    question: "日勤・夜勤以外のシフトも登録できますか？",
    answer:
      "はい。勤務パターンの名前、絵文字、時間を設定できます。勤務先のシフトに合わせて登録してお使いください。",
  },
  {
    question: "グループに参加するには？",
    answer:
      "メンバーから届いた招待リンクを開き、「アプリで開く」を選びます。アプリ内で表示名を入力して参加してください。無効なリンクと表示された場合は、送り主に新しいリンクを確認してください。",
  },
  {
    question: "シフトを端末のカレンダーに書き出せますか？",
    answer:
      "はい。カレンダー画面の保存メニューから、端末カレンダーへの書き出しや画像保存ができます。必要なアクセス権限を許可してご利用ください。",
  },
  {
    question: "アプリを削除すると、アカウントも消えますか？",
    answer:
      "アプリのアンインストールだけでは、サーバー上のアカウントやデータは削除されません。アプリの設定、またはこのサイトのアカウント削除ページから手続きしてください。",
  },
];
function Support() {
  return (
    <Page
      eyebrow="SUPPORT"
      intro="気になること、困ったこと。ここからお手伝いします。"
      title="サポート"
    >
      <section className="faq-section">
        <h2>よくある質問</h2>
        {questions.map((item) => (
          <details className="faq" key={item.question}>
            <summary>
              {item.question}
              <Plus aria-hidden="true" size={18} />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </section>
      <section className="contact-box">
        <p className="eyebrow">CONTACT</p>
        <h2>解決しないときは</h2>
        <p>
          ご質問、不具合のご報告、ご要望をお寄せください。
          <br />
          不具合の場合は、端末の種類・アプリのバージョン・発生した状況を添えていただけると助かります。
        </p>
        <a
          className="text-link"
          href={`mailto:${site.email}?subject=${encodeURIComponent("ポチカレのお問い合わせ")}`}
        >
          {site.email}
          <ArrowUpRight aria-hidden="true" size={17} />
        </a>
        <p className="small-note">
          パスワードや患者さんの情報は送らないでください。
        </p>
      </section>
      <Link className="text-link" to="/account/delete">
        アカウント削除の手続きはこちら →
      </Link>
    </Page>
  );
}
