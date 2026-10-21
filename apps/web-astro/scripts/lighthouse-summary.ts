// Medians and ranges of scripts/lighthouse.sh's reports.
// bun scripts/lighthouse-summary.ts <out dir>
import { readdir, readFile } from "node:fs/promises";

const dir = process.argv[2];
const groups = new Map<string, { score: number; lcp: number; tbt: number; fcp: number }[]>();
for (const file of await readdir(dir)) {
  const report = JSON.parse(await readFile(`${dir}/${file}`, "utf-8"));
  const key = file.replace(/-\d+\.json$/, "");
  const audit = (id: string) => report.audits[id].numericValue as number;
  const runs = groups.get(key) ?? [];
  runs.push({
    fcp: audit("first-contentful-paint"),
    lcp: audit("largest-contentful-paint"),
    score: report.categories.performance.score * 100,
    tbt: audit("total-blocking-time"),
  });
  groups.set(key, runs);
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
for (const [key, runs] of [...groups].sort()) {
  const line = (["score", "fcp", "lcp", "tbt"] as const)
    .map((metric) => {
      const values = runs.map((run) => run[metric]);
      return `${metric} ${median(values).toFixed(0)} (${Math.min(...values).toFixed(0)}-${Math.max(...values).toFixed(0)})`;
    })
    .join("  ");
  console.log(`${key.padEnd(16)} n=${runs.length}  ${line}`);
}
