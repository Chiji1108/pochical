import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUpRight,
  CalendarDays,
  MousePointer2,
  UsersRound,
} from "lucide-react";
import { CalendarPreview } from "../components/calendar-preview";
import { StoreLinks } from "../components/store-links";
import { pageMeta, site } from "../lib/site";

export const Route = createFileRoute("/")({
  head: () => pageMeta("看護師のためのシフトカレンダー", site.description, "/"),
  component: Home,
});

function Home() {
  return (
    <main id="main">
      <section className="hero">
        <p className="eyebrow">
          <span className="tiny-dot" /> 看護師のためのシフトカレンダー
        </p>
        <h1>
          シフトを、ポチッと。
          <br />
          毎日に、<span className="accent-text">ゆとりを。</span>
        </h1>
        <p className="hero-description">
          日勤も、夜勤も、お休みも。
          <br />
          ポチッと入力、さっと共有。
          <br className="mobile-break" />
          忙しい毎日に寄り添う、ポチカル。
        </p>
        <div id="download">
          <StoreLinks />
        </div>
        <p className="release-note">iPhone・Android 向けに、ただいま準備中。</p>
        <a className="scroll-cue" href="#about">
          <span>ポチカルでできること</span>
          <ArrowDown aria-hidden="true" size={15} />
        </a>
      </section>
      <CalendarPreview />
      <section className="features section-width" id="about">
        <div className="section-heading">
          <p className="eyebrow">LESS TAPPING. MORE LIVING.</p>
          <h2>
            シフト管理は、
            <br className="mobile-break" />
            もっと気軽でいい。
          </h2>
          <p>
            勤務表をもらったら、ポチカルへ。
            <br />
            仕事の予定も、その先の楽しみも、見通しよく。
          </p>
        </div>
        <div className="feature-grid">
          <article>
            <span className="feature-icon">
              <MousePointer2 aria-hidden="true" size={24} />
            </span>
            <p className="feature-number">01 / INPUT</p>
            <h3>選んで、ポチッ。</h3>
            <p>
              いつものシフトを選んで、日付をタップ。勤務時間や名前を毎回入力する手間を減らします。
            </p>
          </article>
          <article>
            <span className="feature-icon">
              <CalendarDays aria-hidden="true" size={24} />
            </span>
            <p className="feature-number">02 / CALENDAR</p>
            <h3>ひと月が、ひと目で。</h3>
            <p>
              日勤、夜勤、明け、お休み。絵文字で見分けられるカレンダーで、次の予定も立てやすく。
            </p>
          </article>
          <article>
            <span className="feature-icon">
              <UsersRound aria-hidden="true" size={24} />
            </span>
            <p className="feature-number">03 / SHARE</p>
            <h3>「いつ休み？」も、さっと。</h3>
            <p>
              招待リンクでグループをつくって、シフトを共有。友だちと休みを合わせたいときにも。
            </p>
          </article>
        </div>
      </section>
      <section className="closing section-width">
        <img alt="" height={62} src="/icon.png" width={62} />
        <h2>
          はたらく日も、
          <br />
          おやすみの日も。
        </h2>
        <p>あなたの毎日に、ポチカル。</p>
        <a className="text-link" href="#download">
          アプリの公開について <ArrowUpRight aria-hidden="true" size={17} />
        </a>
      </section>
      <div className="support-strip section-width">
        <span>気になること、困ったこと。</span>
        <Link to="/support">
          サポートはこちら <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      </div>
    </main>
  );
}
