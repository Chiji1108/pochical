// Compares where the two builds break Japanese: each page's <body> text,
// with every <wbr> as "|", tags and React's <!-- --> dropped.
// bun scripts/compare-wbr.ts http://localhost:3917 http://localhost:4917
const [tanstack, astro] = process.argv.slice(2);

const textWithBreaks = (html: string) =>
  (html.split(/<body[^>]*>/)[1] ?? "")
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/g, "")
    .replace(/<wbr\s*\/?>/g, "|")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter((word) => /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u.test(word));

for (const path of ["/", "/privacy"]) {
  const [a, b] = await Promise.all(
    [tanstack, astro].map(async (origin) =>
      textWithBreaks(await (await fetch(`${origin}${path}`)).text())
    )
  );
  const onlyA = a.filter((word) => !b.includes(word));
  const onlyB = b.filter((word) => !a.includes(word));
  const breaks = (words: string[]) => words.join("").split("|").length - 1;
  console.log(
    `${path}: TanStack ${a.length} runs, ${breaks(a)} breaks; Astro ${b.length} runs, ${breaks(b)} breaks; identical sequence: ${a.join(" ") === b.join(" ")}`
  );
  for (const word of onlyA) console.log(`  only TanStack: ${word}`);
  for (const word of onlyB) console.log(`  only Astro:    ${word}`);
}
