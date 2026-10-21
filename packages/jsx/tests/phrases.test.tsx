import { expect, test } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { phrasesOf } from "../src/phrases";

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

const Title = ({ title }: { title: ReactNode }) => <h2>{title}</h2>;
const Notice = () => <>ページが見つかりません。</>;

test("marks Japanese in a Fragment once, wherever its content lands", () => {
  const body = (
    <>
      家族や友だちのシフトを、ひとつの表に。
      <br />
      みんなが休みの日も、すぐ見つかります。
    </>
  );
  expect(renderToStaticMarkup(<p>{body}</p>)).toBe(
    "<p>家族や<wbr/>友だちの<wbr/>シフトを、<wbr/>ひとつの<wbr/>表に。<br/>みんなが<wbr/>休みの<wbr/>日も、<wbr/>すぐ<wbr/>見つかります。</p>"
  );
  expect(
    renderToStaticMarkup(
      <Title
        title={
          <>
            見た目も、
            <br />
            自分らしく。
          </>
        }
      />
    )
  ).toBe("<h2>見た<wbr/>目も、<br/>自分らしく。</h2>");
  expect(
    renderToStaticMarkup(
      <p>
        <Notice />
      </p>
    )
  ).toBe("<p>ページが<wbr/>見つかりません。</p>");
});
