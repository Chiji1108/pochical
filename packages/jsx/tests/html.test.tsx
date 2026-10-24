import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { phraseHtml } from "../src/html";

// A paragraph of the text as the JSX runtime draws it, in HTML's spelling.
const fromJsx = (text: string) =>
  renderToStaticMarkup(<p>{text}</p>).replaceAll("<wbr/>", "<wbr>");

test("breaks an HTML page's Japanese where the JSX runtime does", () => {
  expect(phraseHtml("<p>ページが見つかりません。</p>")).toBe(
    fromJsx("ページが見つかりません。")
  );
});

test("reads a text node whole, across its character references", () => {
  const text = "規約&ポリシーを<確認>してください。";
  expect(fromJsx(text)).toContain("&amp;");
  expect(
    phraseHtml("<p>規約&amp;ポリシーを&lt;確認&gt;してください。</p>")
  ).toBe(fromJsx(text));
});

test("reads a text node's whitespace as JSX does", () => {
  expect(phraseHtml("<p>アプリで開く </p>")).toBe(fromJsx("アプリで開く "));
  expect(phraseHtml("<p>\n  ← サポートに戻る\n</p>")).toBe(
    fromJsx("← サポートに戻る")
      .replace("<p>", "<p>\n  ")
      .replace("</p>", "\n</p>")
  );
});

test("leaves the head, islands and text not laid out in lines whole", () => {
  const html = [
    "<html><head><title>ページが見つかりません。</title></head><body>",
    "<astro-island><p>ページが<wbr>見つかりません。</p></astro-island>",
    "<script>const a = 'ページが見つかりません。'</script>",
    "<svg><text>ページが見つかりません。</text></svg>",
    "<svg><textPath>ページが見つかりません。</textPath></svg>",
    "<textarea>ページが見つかりません。</textarea>",
    "</body></html>",
  ].join("");
  expect(phraseHtml(html)).toBe(html);
});

test("leaves text without Japanese as it is", () => {
  const html = '<p class="a">Pochical &amp; 1.0</p>';
  expect(phraseHtml(html)).toBe(html);
});
