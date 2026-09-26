import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { site } from "../lib/site";

export function Header() {
  return (
    <header className="site-header">
      <Link aria-label="ポチカル ホーム" className="brand" to="/">
        <img alt="" height={36} src="/icon.png" width={36} />
        <span>ポチカル</span>
      </Link>
      <nav aria-label="メインナビゲーション">
        <Link to="/support">
          サポート <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
        <a className="header-cta" href="/#download">
          アプリについて
        </a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Link className="brand" to="/">
            <img alt="" height={30} src="/icon.png" width={30} />
            <span>ポチカル</span>
          </Link>
          <p>はたらく日も、おやすみの日も。</p>
        </div>
        <nav aria-label="フッターナビゲーション">
          <Link to="/support">サポート</Link>
          <Link to="/privacy">プライバシーポリシー</Link>
          <Link to="/terms">利用規約</Link>
          <Link to="/account/delete">アカウント削除</Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© 2026 ポチカル</span>
        <a href={`mailto:${site.email}`}>
          {site.email} <ArrowUpRight aria-hidden="true" size={12} />
        </a>
      </div>
    </footer>
  );
}

export function Page({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="document-page" id="main">
      <Link className="back-link" to="/">
        ← ポチカルについて
      </Link>
      <header className="page-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>
      {children}
    </main>
  );
}
