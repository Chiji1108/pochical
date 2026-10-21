// What bounds a Lighthouse run's LCP: the element, its phases, the
// render-blocking resources and the requests on the way.
// bun scripts/lighthouse-explain.ts <report.json> ...
import { readFile } from "node:fs/promises";

for (const file of process.argv.slice(2)) {
  const report = JSON.parse(await readFile(file, "utf-8"));
  const { audits } = report;
  const lcp = audits["largest-contentful-paint-element"]?.details?.items;
  const node = lcp?.[0]?.items?.[0]?.node;
  console.log(file.split("/").pop(), node?.selector, (node?.snippet ?? "").slice(0, 140));
  console.log("  phases", JSON.stringify(lcp?.[1]?.items));
  const blocking = audits["render-blocking-insight"] ?? audits["render-blocking-resources"];
  console.log(
    "  blocking",
    blocking?.details?.items?.map(
      (item: { url: string; wastedMs?: number }) =>
        `${item.url.split("/").pop()}:${Math.round(item.wastedMs ?? 0)}`
    )
  );
  const requests = audits["network-requests"].details.items as {
    url: string;
    resourceType: string;
    transferSize: number;
    networkRequestTime: number;
    networkEndTime: number;
  }[];
  console.log(
    "  net",
    requests
      .filter((item) => /Document|Script|Stylesheet|Image/.test(item.resourceType))
      .map(
        (item) =>
          `${item.resourceType[0]}:${item.url.split("/").pop()?.slice(0, 24)}:${Math.round(item.transferSize / 1024)}K@${Math.round(item.networkRequestTime)}-${Math.round(item.networkEndTime)}`
      )
      .join(" | ")
  );
}
