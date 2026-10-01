import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { phrasesOf } from "../src/lib/phrases";

test("breaks Japanese between phrases, never inside a word", () => {
  const phrases = phrasesOf(
    "参加すると、あなたのシフトもメンバーに見えるようになります。"
  );
  expect(phrases.length).toBeGreaterThan(1);
  expect(phrases.join("")).toBe(
    "参加すると、あなたのシフトもメンバーに見えるようになります。"
  );
  expect(phrases.some((phrase) => phrase.includes("メンバー"))).toBe(true);
});

test("leaves text without Japanese whole", () => {
  expect(phrasesOf("Pochical 1.0")).toEqual(["Pochical 1.0"]);
});

test("marks the phrases of every element's Japanese with <wbr>", () => {
  expect(renderToStaticMarkup(<p>ページが見つかりません。</p>)).toBe(
    "<p>ページが<wbr/>見つかりません。</p>"
  );
  const name = "さくら";
  expect(renderToStaticMarkup(<p>{name}さんのシフトを見る</p>)).toBe(
    "<p>さくらさんの<wbr/>シフトを<wbr/>見る</p>"
  );
});

const Count = ({ children }: { children: string }) => (
  <span data-length={children.length} />
);

test("leaves the site's own components their strings", () => {
  expect(renderToStaticMarkup(<Count>ページが見つかりません。</Count>)).toBe(
    '<span data-length="12"></span>'
  );
});

test("keeps text that is not laid out in lines whole", () => {
  expect(
    renderToStaticMarkup(
      <select>
        <option>いつもと同じ名前</option>
      </select>
    )
  ).not.toContain("<wbr");
});

test("marks them where a key follows a spread, too", () => {
  const props = { className: "note" };
  expect(
    renderToStaticMarkup(
      <p {...props} key="note">
        ページが見つかりません。
      </p>
    )
  ).toBe('<p class="note">ページが<wbr/>見つかりません。</p>');
});
