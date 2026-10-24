import { expect, test } from "vitest";

import { assetLinks, openInApp } from "../src/lib/app-links";

const pixel =
  "Mozilla/5.0 (Linux; Android 17; Pixel 10a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

test("Android opens the invitation in the app, or Play's page for it", () => {
  expect(openInApp("Toko2345", pixel)).toBe(
    "intent://invite/Toko2345#Intent;scheme=pochical;package=app.pochical;end"
  );
});

test("other phones open the app's own link", () => {
  expect(openInApp("Toko2345", iphone)).toBe("pochical://invite/Toko2345");
  expect(openInApp("Toko2345", null)).toBe("pochical://invite/Toko2345");
});

test("the app is named for the site's links with its certificates", () => {
  const fingerprint =
    "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";
  expect(assetLinks([fingerprint])).toEqual([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "app.pochical",
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ]);
});

test("no certificate named claims no link", () => {
  expect(assetLinks([])).toEqual([]);
});
