import { defineTranslations } from "fumadocs-core/i18n";
import { i18nProvider, uiTranslations } from "fumadocs-ui/i18n";

// Fumadocs UI's own words in Japanese, the documents' one language. Keys
// it has that these pages never show (AI chat, GitHub, type tables) are
// left out.
export const japanese = i18nProvider(
  defineTranslations().extend(uiTranslations()).add({
    "Back to Home(404 page)": "デザイン資料へ",
    "Close Search(search dialog)(aria-label)": "検索を閉じる",
    "Close Sidebar(aria-label)": "サイドバーを閉じる",
    "Close Sidebar(sidebar)(aria-label)": "サイドバーを閉じる",
    "Close(image zoom)(aria-label)": "閉じる",
    "Collapse Sidebar(sidebar)(aria-label)": "サイドバーを畳む",
    "Copied Anchor Link(heading anchor)(aria-label)":
      "見出しへのリンクをコピーしました",
    "Copied Text(code block)(aria-label)": "コピーしました",
    "Copy Anchor Link(heading anchor)(aria-label)": "見出しへのリンクをコピー",
    "Copy Text(code block)(aria-label)": "コピー",
    "Dark(theme switcher)(aria-label)": "ダーク",
    "Hide Sidebar(sidebar)": "サイドバーを隠す",
    "Image Viewer(image zoom)(aria-label)": "画像",
    "Light(theme switcher)(aria-label)": "ライト",
    "Next Page(pagination)": "次へ",
    "No Headings(table of contents)": "見出しはありません",
    "No results found(search dialog)": "見つかりませんでした",
    "On this page(table of contents)": "このページの内容",
    "Open Search(search trigger)(aria-label)": "検索を開く",
    "Open Sidebar(sidebar)(aria-label)": "サイドバーを開く",
    "Page Not Found(404 page)": "ページが見つかりません",
    "Previous Page(pagination)": "前へ",
    "Search failed(search dialog)": "検索できませんでした",
    "Search failed, showing results for {query}(search dialog)":
      "検索できなかったため、{query} の結果を出しています",
    "Search(search dialog)": "検索",
    "Search(search trigger)": "検索",
    "Show Sidebar(sidebar)": "サイドバーを出す",
    "System(theme switcher)(aria-label)": "端末に合わせる",
    "Table of Contents(inline table of contents)": "目次",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "ページが移ったか、なくなったようです。",
    "Toggle Menu(mobile menu)(aria-label)": "メニュー",
    "Toggle Theme(theme switcher)(aria-label)": "外観を切り替える",
  })
);
