// The site's own HTTPS origin (VITE_SITE_URL), once it has a domain: the
// pages' canonical and share addresses name it.
export const siteOrigin = (): string | undefined => {
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

// A page's own share image, at SHARE_IMAGE's size, in place of the site's.
export type PageImage = { path: string; alt: string };

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
