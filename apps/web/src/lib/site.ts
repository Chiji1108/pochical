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

const storeLink = (
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

// The app's store pages, once each URL is set for the build.
export const appStoreUrl = (): string | undefined =>
  storeLink(import.meta.env.VITE_APP_STORE_URL, "apps.apple.com");

// The app's id in the App Store, as its page's address ends, which the
// banner Safari shows for the app on an iPhone names.
const APP_STORE_ID = /\/id(?<id>\d+)$/u;
export const appStoreId = (): string | undefined => {
  const url = appStoreUrl();
  if (url === undefined) {
    return;
  }
  return APP_STORE_ID.exec(new URL(url).pathname)?.groups?.id;
};

export const googlePlayUrl = (): string | undefined =>
  storeLink(import.meta.env.VITE_GOOGLE_PLAY_URL, "play.google.com");

// The stores the app is on, each with the phone it is for and its page,
// none until its URL is set.
export const stores = () => [
  { name: "App Store", phone: "iPhone", url: appStoreUrl() } as const,
  { name: "Google Play", phone: "Android", url: googlePlayUrl() } as const,
];
