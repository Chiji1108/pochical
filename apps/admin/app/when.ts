/** When, as Pochical's people read it: Japan's time. */
export const when = (ms: number): string =>
  new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
