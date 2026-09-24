export const site = {
  name: "ポチカレ",
  email: "contact@chiji.tech",
  description:
    "日勤も、夜勤も、お休みも。ポチッと入力、さっと共有。看護師の毎日に寄り添うシフトカレンダー、ポチカレ。",
};

export const getSiteOrigin = (): string | undefined => {
  const value = import.meta.env.VITE_SITE_URL;
  if (!value) {
    return;
  }
  const url = new URL(value);
  if (url.protocol !== "https:") {
    return;
  }
  return url.origin;
};

export const pageMeta = (
  title: string,
  description: string,
  path: string,
  privatePage = false
) => {
  const origin = getSiteOrigin();
  return {
    meta: [
      { title: `${title} | ポチカレ` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | ポチカレ` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ja_JP" },
      ...(origin
        ? [{ property: "og:image", content: `${origin}/icon.png` }]
        : []),
      ...(privatePage
        ? [{ name: "robots", content: "noindex, nofollow" }]
        : []),
    ],
    links:
      origin && !privatePage
        ? [{ rel: "canonical", href: `${origin}${path}` }]
        : [],
  };
};

export const storeLink = (
  value: string | undefined,
  hostname: string
): string | undefined => {
  if (!value) {
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === hostname) {
      return url.href;
    }
  } catch {
    return;
  }
};
