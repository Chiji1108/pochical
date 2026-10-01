import { expect, test } from "bun:test";

import {
  firstLink,
  inviteCodeOf,
  siteOf,
  textParts,
} from "../src/lib/chat-links";

test("leaves a message without links whole", () => {
  expect(textParts("21日にしよ！")).toEqual([{ text: "21日にしよ！" }]);
});

test("finds a link between words and on its own line", () => {
  expect(textParts("ここ気になってた！\nhttps://cafe.example/menu")).toEqual([
    { text: "ここ気になってた！\n" },
    { text: "https://cafe.example/menu", url: "https://cafe.example/menu" },
  ]);
});

test("ends a link where Japanese starts", () => {
  expect(textParts("https://cafe.example/ここどう？")).toEqual([
    { text: "https://cafe.example/", url: "https://cafe.example/" },
    { text: "ここどう？" },
  ]);
});

test("leaves the sentence's full stop and brackets out", () => {
  expect(textParts("(see http://a.example/x).")).toEqual([
    { text: "(see " },
    { text: "http://a.example/x", url: "http://a.example/x" },
    { text: ")." },
  ]);
  expect(firstLink("https://ja.example/wiki/A_(B)")).toBe(
    "https://ja.example/wiki/A_(B)"
  );
  expect(firstLink("見て https://a.example/?q=1, ね")).toBe(
    "https://a.example/?q=1"
  );
});

test("finds every link, the first for the preview", () => {
  const parts = textParts("https://a.example と https://b.example");
  expect(parts.filter((part) => part.url).map((part) => part.url)).toEqual([
    "https://a.example",
    "https://b.example",
  ]);
  expect(firstLink("https://a.example と https://b.example")).toBe(
    "https://a.example"
  );
});

test("needs the scheme and a host", () => {
  expect(firstLink("cafe.example/menu")).toBeUndefined();
  expect(firstLink("www.cafe.example")).toBeUndefined();
  expect(firstLink("https://")).toBeUndefined();
  expect(firstLink("HTTPS://CAFE.EXAMPLE")).toBe("HTTPS://CAFE.EXAMPLE");
});

test("names a site by its host", () => {
  expect(siteOf("https://www.cafe.example/menu")).toBe("cafe.example");
});

test("knows Pochical's invitation links", () => {
  expect(inviteCodeOf("https://pochical.app/invite/Toko2345")).toBe("Toko2345");
  expect(inviteCodeOf("https://POCHICAL.app/invite/Toko2345/?from=line")).toBe(
    "Toko2345"
  );
  for (const url of [
    "http://pochical.app/invite/Toko2345",
    "https://pochical.app/invite/Toko",
    "https://pochical.app/invite/Toko2345/more",
    "https://pochical.app/support",
    "https://evil.example/invite/Toko2345",
    "https://pochical.app.evil.example/invite/Toko2345",
  ]) {
    expect(inviteCodeOf(url)).toBeUndefined();
  }
});
