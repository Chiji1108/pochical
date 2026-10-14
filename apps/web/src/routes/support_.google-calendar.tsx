import { createFileRoute, Link } from "@tanstack/react-router";

import { Page } from "../components/site-layout";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/support_/google-calendar")({
  component: GoogleCalendarGuide,
  head: () =>
    pageMeta(
      "Googleカレンダーにシフトを入れる",
      "iPhoneにGoogleアカウントを追加して、ポチカルのシフトをGoogleカレンダーに入れる方法。",
      "/support/google-calendar"
    ),
});

// Opened from the iPhone's 端末カレンダーに追加 (spec/calendar.md): the app
// puts the month in a calendar of the device, and one of a Google account
// added to the iPhone goes on to Google Calendar.
function GoogleCalendarGuide() {
  return (
    <Page
      eyebrow="GUIDE"
      intro="ポチカルのシフトは、iPhoneのカレンダーを通して、Googleカレンダーにも入れられます。iPhoneにGoogleアカウントを追加して、ポチカルで追加先にそのカレンダーを選んでください。"
      title="Googleカレンダーにシフトを入れる"
    >
      <div className="legal-content guide-content">
        <section>
          <h2>
            <span className="legal-index">1</span>
            iPhoneにGoogleアカウントを追加する
          </h2>
          <ol>
            <li>設定アプリを開きます。</li>
            <li>「アプリ」から「カレンダー」を開きます。</li>
            <li>
              「カレンダーアカウント」から「アカウントを追加」を選びます。
            </li>
            <li>「Google」を選んで、Googleアカウントでログインします。</li>
            <li>「カレンダー」をオンにして、保存します。</li>
          </ol>
          <p className="small-note">
            すでに追加しているときは、「カレンダーアカウント」でそのアカウントを開き、「カレンダー」がオンになっているか確かめてください。
          </p>
          <div className="guide-shots">
            <figure>
              <img
                alt="設定アプリのカレンダーの画面。「カレンダーアカウント」の行がある。"
                height={515}
                src="/support/calendar-settings.png"
                width={600}
              />
              <figcaption>「カレンダーアカウント」を開く</figcaption>
            </figure>
            <figure>
              <img
                alt="アカウントを追加の画面。iCloud、Microsoft Exchange、Google、yahoo!、Aol.、Outlook.comが並ぶ。"
                height={1030}
                src="/support/add-account.png"
                width={600}
              />
              <figcaption>「アカウントを追加」で「Google」を選ぶ</figcaption>
            </figure>
          </div>
        </section>
        <section>
          <h2>
            <span className="legal-index">2</span>
            ポチカルから追加する
          </h2>
          <ol>
            <li>
              カレンダーの右上の保存ボタンから「端末カレンダーに追加」を選びます。
            </li>
            <li>
              「追加先」で、Googleアカウントの下（最初は「Gmail」という名前）にあるカレンダーを選びます。メールアドレスの名前のものが、Googleカレンダーのいつものカレンダーです。
            </li>
            <li>「追加」を押すと、表示している月のシフトが入ります。</li>
          </ol>
          <div className="guide-shots">
            <figure>
              <img
                alt="ポチカルの追加先の画面。iCloudの下と、Gmailの下にカレンダーが並ぶ。"
                height={619}
                src="/support/calendar-picker.png"
                width={600}
              />
              <figcaption>「Gmail」の下のカレンダーを選ぶ</figcaption>
            </figure>
          </div>
          <p className="small-note">
            「iCloud」や「このiPhone」の下のカレンダーを選ぶと、Googleカレンダーには入りません。次からは、前に追加したカレンダーが最初に選ばれています。
          </p>
        </section>
        <section>
          <h2>
            <span className="legal-index">3</span>
            うまくいかないとき
          </h2>
          <h3>追加先に「Gmail」（Googleアカウント）が出てこない</h3>
          <p>
            メールのためにGoogleアカウントを追加していても、カレンダーがオフのままのことがあります。設定アプリの「アプリ」→「カレンダー」→「カレンダーアカウント」でそのアカウントを開き、「カレンダー」をオンにしてください。そこにGoogleのアカウントがないときは、1の手順で追加します。オンにしたら少し待ってから、ポチカルの「端末カレンダーに追加」を開き直してください。
          </p>
          <div className="guide-shots">
            <figure>
              <img
                alt="設定アプリのGmailアカウントの画面。メール、連絡先、カレンダー、メモのスイッチが並び、カレンダーがオンになっている。"
                height={632}
                src="/support/account-calendar.png"
                width={600}
              />
              <figcaption>「カレンダー」をオンにする</figcaption>
            </figure>
          </div>
          <h3>Googleカレンダーに出てこない</h3>
          <p>
            Googleに届くまで、少し時間がかかることがあります。しばらくしても出てこないときは、追加先にGoogleアカウントの下のカレンダーを選んだか確かめてください。
          </p>
          <h3>追加先に、使いたいカレンダーが出てこない</h3>
          <p>
            追加先には、予定を書き込めるカレンダーだけが出ます。Googleカレンダーで作ったカレンダーがiPhoneに出てこないときは、パソコンで
            <a
              href="https://calendar.google.com/calendar/syncselect"
              rel="noreferrer"
              target="_blank"
            >
              Googleカレンダーの同期の設定
            </a>
            を開き、使いたいカレンダーにチェックを入れて保存してください。
          </p>
          <h3>勤務先や学校のGoogleアカウントを使っている</h3>
          <p>
            管理者の設定によって、iPhoneと同期できないことがあります。その場合は、個人のGoogleアカウントをお使いください。
          </p>
          <h3>あとからシフトを変えた</h3>
          <p>
            追加したあとの変更は、Googleカレンダーに自動では反映されません。同じ月をもう一度追加すると、前に入れたその月の予定を入れ直します。
          </p>
        </section>
      </div>
      <div className="document-links">
        <Link className="text-link" to="/support">
          ← サポートに戻る
        </Link>
      </div>
    </Page>
  );
}
