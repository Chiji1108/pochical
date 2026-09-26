export const site = {
  description:
    "日勤も、夜勤も、お休みも。ポチッと入力、さっと共有。看護師の毎日に寄り添うシフトカレンダー、ポチカル。",
  email: "contact@chiji.tech",
  name: "ポチカル",
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
    links:
      origin && !privatePage
        ? [{ href: `${origin}${path}`, rel: "canonical" }]
        : [],
    meta: [
      { title: `${title} | ポチカル` },
      { content: description, name: "description" },
      { content: `${title} | ポチカル`, property: "og:title" },
      { content: description, property: "og:description" },
      { content: "website", property: "og:type" },
      { content: "ja_JP", property: "og:locale" },
      ...(origin
        ? [{ content: `${origin}/icon.png`, property: "og:image" }]
        : []),
      ...(privatePage
        ? [{ content: "noindex, nofollow", name: "robots" }]
        : []),
    ],
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
