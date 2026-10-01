export const site = {
  description:
    "勤務を選んで、日付をポチポチ。家族や友だちとも共有できるシフトカレンダー、ポチカル。",
  email: "contact@chiji.tech",
  name: "ポチカル",
};

// The picture shared links show (og:image), at the size previews expect.
export const SHARE_IMAGE = {
  alt: "ポチカル シフトを、ポチッと。",
  height: 630,
  path: "/share.png",
  width: 1200,
} as const;

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
      { content: site.name, property: "og:site_name" },
      { content: "summary_large_image", name: "twitter:card" },
      ...(origin
        ? [
            { content: `${origin}${path}`, property: "og:url" },
            { content: `${origin}${SHARE_IMAGE.path}`, property: "og:image" },
            { content: String(SHARE_IMAGE.width), property: "og:image:width" },
            {
              content: String(SHARE_IMAGE.height),
              property: "og:image:height",
            },
            { content: SHARE_IMAGE.alt, property: "og:image:alt" },
          ]
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
