import { expect, test } from "vitest";

import { structuredData } from "../src/lib/structured-data";

test("names the site and the app with the stores that have it", () => {
  const text = structuredData("https://pochical.app", [
    "https://apps.apple.com/jp/app/id1",
    undefined,
  ]);
  expect(text).not.toContain("<");
  expect(text).toContain('"@type":"WebSite"');
  expect(text).toContain('"url":"https://pochical.app/"');
  expect(text).toContain('"sameAs":["https://apps.apple.com/jp/app/id1"]');
});
