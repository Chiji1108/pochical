// National holidays for every platform, by country code and then date
// ("YYYY-MM-DD") → name: all that calendars read of them, so each platform
// marks the same days. Japan's come from @holiday-jp/holiday_jp; a country
// added later gets its own key. Update the package and run `mise run gen`.
import holidayJp from "@holiday-jp/holiday_jp";

// Days before this are older than any shift kept in the app.
const FROM = "2000-01-01";

type Names = Record<string, string>;

export const holidaysByCountry: Record<string, Names> = {
  JP: Object.fromEntries(
    Object.entries(holidayJp.holidays)
      .filter(([date]) => date >= FROM)
      .map(([date, { name }]) => [date, name])
  ),
};

const DOC =
  'National holidays by country code ("JP") and date ("YYYY-MM-DD"), from design/scripts/holidays.ts.';

// One line a day, date and name split by a tab (names hold spaces):
// compact enough for a single Kotlin string, which the JVM keeps under
// 64 KB, and quick for Swift to compile, unlike a dictionary literal.
const lines = (names: Names) =>
  Object.entries(names).map(([date, name]) => `${date}\t${name}`);

const countries = Object.entries(holidaysByCountry);

export const webHolidays = (header: string) =>
  [
    `// ${header}`,
    `// ${DOC}`,
    "export const holidays: Record<string, Record<string, string | undefined> | undefined> = {",
    ...countries.flatMap(([country, names]) => [
      `  ${country}: {`,
      ...Object.entries(names).map(
        ([date, name]) => `    "${date}": ${JSON.stringify(name)},`
      ),
      "  },",
    ]),
    "};",
    "",
  ].join("\n");

export const swiftHolidays = () => [
  `/// ${DOC}`,
  "public enum Holidays {",
  '  /// The holiday\'s name on `date` ("YYYY-MM-DD") in `country` ("JP"), or nil.',
  "  public static func name(on date: String, in country: String) -> String? {",
  "    table[country]?[date]",
  "  }",
  "",
  "  private static let table: [String: [String: String]] = [",
  ...countries.map(([country]) => `    "${country}": parse(${country}),`),
  "  ]",
  "",
  "  private static func parse(_ text: String) -> [String: String] {",
  "    var names: [String: String] = [:]",
  '    for line in text.split(separator: "\\n") {',
  '      let fields = line.split(separator: "\\t", maxSplits: 1)',
  "      names[String(fields[0])] = String(fields[1])",
  "    }",
  "    return names",
  "  }",
  ...countries.flatMap(([country, names]) => [
    "",
    `  private static let ${country} = """`,
    ...lines(names).map((line) => `    ${line.replace("\t", "\\t")}`),
    '    """',
  ]),
  "}",
];

export const kotlinHolidays = () => [
  `/** ${DOC} */`,
  "object Holidays {",
  '  /** The holiday\'s name on [date] ("YYYY-MM-DD") in [country] ("JP"), or null. */',
  "  fun nameOf(date: String, country: String): String? = table[country]?.get(date)",
  "",
  "  private val table: Map<String, Map<String, String>> by lazy {",
  `    mapOf(${countries.map(([country]) => `"${country}" to parse(${country})`).join(", ")})`,
  "  }",
  "",
  "  private fun parse(text: String): Map<String, String> =",
  "    text.lines().associate { line ->",
  "      line.substringBefore('\\t') to line.substringAfter('\\t')",
  "    }",
  ...countries.flatMap(([country, names]) => [
    "",
    `  private const val ${country} =`,
    ...lines(names).map(
      (line, index, all) =>
        `    "${line.replace("\t", "\\t")}${index < all.length - 1 ? "\\n" : ""}"${index < all.length - 1 ? " +" : ""}`
    ),
  ]),
  "}",
];
