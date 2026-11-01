// The notices of what design/ writes into both apps from other projects:
// the marks' paths from Phosphor Icons and the holidays from holiday_jp
// (THIRD_PARTY_NOTICES.md). Their licenses ask that the notice travel with
// every copy, so each app's ライセンス lists them beside the packages its
// build resolves (spec/calendar.md, ライセンス). The text is the package's
// own LICENSE, read from node_modules: an update that changes it changes
// the apps' with `mise run gen`.
import { readFileSync } from "node:fs";
import path from "node:path";

const notices = [
  {
    license: "@phosphor-icons/react/LICENSE",
    name: "Phosphor Icons",
    url: "https://github.com/phosphor-icons/react",
  },
  {
    license: "@holiday-jp/holiday_jp/LICENSE",
    name: "holiday_jp",
    url: "https://github.com/holiday-jp/holiday_jp",
  },
].map(({ license, ...notice }) => ({
  ...notice,
  text: readFileSync(
    path.join(import.meta.dirname, "../node_modules", license),
    "utf-8"
  ).trim(),
}));

const DOC =
  "What design/ writes into the app from other projects, each with its license's text (design/scripts/notices.ts).";

// A string literal of `value`: quotes, backslashes and line breaks escaped
// as both languages write them, any other control character by its code
// point in the language's own form (`unicode`), and `$` as `dollar`, which
// Kotlin reads as a template.
const literal = (
  value: string,
  unicode: (hex: string) => string,
  dollar: string
) => {
  const known: Record<string, string> = {
    "\t": "\\t",
    "\n": "\\n",
    "\r": "\\r",
    '"': '\\"',
    $: dollar,
    "\\": "\\\\",
  };
  const escaped = value.replaceAll(
    /[\p{Cc}"\\$]/gu,
    (char) =>
      known[char] ??
      unicode((char.codePointAt(0) ?? 0).toString(16).padStart(4, "0"))
  );
  return `"${escaped}"`;
};

const swiftString = (value: string) =>
  literal(value, (hex) => `\\u{${hex}}`, "$");

const kotlinString = (value: string) =>
  literal(value, (hex) => `\\u${hex}`, "\\$");

export const swiftNotices = () => [
  `/// ${DOC}`,
  "public enum Notices {",
  "  public struct Notice: Sendable {",
  "    public let name: String",
  "    public let url: String",
  "    public let text: String",
  "  }",
  "",
  "  public static let all: [Notice] = [",
  ...notices.map(
    ({ name, url, text }) =>
      `    Notice(name: ${swiftString(name)}, url: ${swiftString(url)}, text: ${swiftString(text)}),`
  ),
  "  ]",
  "}",
];

// /design's ライセンス shows them too, as it stands for the apps' page.
export const webNotices = (header: string) =>
  [
    `// ${header}`,
    `// ${DOC}`,
    `export const notices = ${JSON.stringify(notices, null, 2)} as const;`,
    "",
  ].join("\n");

export const kotlinNotices = () => [
  `/** ${DOC} */`,
  "object Notices {",
  "  data class Notice(val name: String, val url: String, val text: String)",
  "",
  "  val all: List<Notice> =",
  "    listOf(",
  ...notices.map(
    ({ name, url, text }) =>
      `      Notice(${kotlinString(name)}, ${kotlinString(url)}, ${kotlinString(text)}),`
  ),
  "    )",
  "}",
];
