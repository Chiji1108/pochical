import { tryUrl } from "@pochical/prototype/lib/try-url";
import { expect, test } from "vitest";

import { primaryAction } from "../src/lib/primary-action";

test("asks to try the prototype on a phone until the App Store has the app", () => {
  expect(primaryAction(undefined)).toEqual({
    href: tryUrl,
    label: "自分のスマホで試す",
  });
});

test("asks to get the app once the App Store has it", () => {
  const appStore = "https://apps.apple.com/jp/app/id0000000000";
  expect(primaryAction(appStore)).toEqual({
    href: appStore,
    label: "App Store で入手",
  });
});
