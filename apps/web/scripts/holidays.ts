// Writes Japan's national holidays as date → name, all that calendars read
// of them. @holiday-jp/holiday_jp keeps each day's weekday and English name
// too, which made it several times the size in every page with a calendar.
// Run again after updating @holiday-jp/holiday_jp: bun run holidays
import { writeFile } from "node:fs/promises";

import holidayJp from "@holiday-jp/holiday_jp";

const OUTPUT = new URL("../src/lib/holiday-names.ts", import.meta.url).pathname;

export function holidayNamesOfPackage() {
  return Object.fromEntries(
    Object.entries(holidayJp.holidays).map(([date, { name }]) => [date, name])
  );
}

if (import.meta.main) {
  const entries = Object.entries(holidayNamesOfPackage()).map(
    ([date, name]) => `  "${date}": ${JSON.stringify(name)},`
  );
  await writeFile(
    OUTPUT,
    [
      "// Written by scripts/holidays.ts (bun run holidays); do not edit.",
      "// Japan's national holidays from @holiday-jp/holiday_jp, by date.",
      "export const holidayNames: Record<string, string | undefined> = {",
      ...entries,
      "};",
      "",
    ].join("\n")
  );
}
