import { expect, test } from "bun:test";

import { holidayNamesOfPackage } from "../scripts/holidays";
import { holidayNames } from "../src/lib/holiday-names";

// The written holidays are the installed package's; if not, run
// bun run holidays.
test("holiday names match the installed @holiday-jp/holiday_jp", () => {
  expect(holidayNames).toEqual(holidayNamesOfPackage());
});
