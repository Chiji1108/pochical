import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus } from "lucide-react";

import { Page } from "../components/site-layout";
import { pageMeta, site } from "../lib/site";

export const Route = createFileRoute("/support")({
  component: Support,
  head: () =>
    pageMeta(
      "サポート",
      "ポチカルのよくある質問とお問い合わせ窓口。",
      "/support"
    ),
});
const questions = [
  {
    answer:
      "現在、App Store・Google Playでの公開を準備しています。公開後は、このサイトからダウンロードできます。",
    question: "アプリはどこからダウンロードできますか？",
  },
  {
    answer:
      "はい。勤務パターンごとに、名前、印（アイコン・絵文字・文字）、色、時間を設定できます。勤務先のシフトに合わせて登録してお使いください。",
    question: "日勤・夜勤以外のシフトも登録できますか？",
  },
  {
    answer:
      "メンバーから届いた招待リンクを開いて「アプリで開く」を選ぶか、メンバーに見せてもらった招待QRコードをアプリで読み取ります。グループで使う名前を確かめて参加してください。使えないリンクと表示された場合は、送り主に新しいリンクを確認してください。",
    question: "グループに参加するには？",
  },
  {
    answer:
      "はい。カレンダー右上の保存ボタンから、端末のカレンダーへの追加や、画像での保存ができます。必要なアクセス権限を許可してご利用ください。",
    question: "シフトを端末のカレンダーに書き出せますか？",
  },
  {
    answer:
      "アプリのアンインストールだけでは、サーバー上のアカウントやデータは削除されません。アプリの設定、またはこのサイトのアカウント削除ページから手続きしてください。",
    question: "アプリを削除すると、アカウントも消えますか？",
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
          ご質問、不具合のご報告、ご要望をお寄せください。アプリの設定にある「お問い合わせ」からなら、チャットで気軽に送れます。
          <br />
          メールで送る場合、不具合については、端末の種類・アプリのバージョン・発生した状況を添えていただけると助かります。
        </p>
        <a
          className="text-link"
          href={`mailto:${site.email}?subject=${encodeURIComponent("ポチカルのお問い合わせ")}`}
        >
          {site.email}
          <ArrowUpRight aria-hidden="true" size={17} />
        </a>
        <p className="small-note">
          パスワードや、勤務先で扱う個人情報は送らないでください。
        </p>
      </section>
      <Link className="text-link" to="/account/delete">
        アカウント削除の手続きはこちら →
      </Link>
    </Page>
  );
}
