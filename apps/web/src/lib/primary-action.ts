// The one thing the top page asks of a visitor who has filled the hero's
// month: getting the app once the App Store has it (lib/site.ts's
// appStoreUrl), and until then trying the prototype (apps/try) on their
// own phone.
export type PrimaryAction = { label: string; href: string };

const TRY_URL = "https://try.pochical.app/";

export const primaryAction = (appStore: string | undefined): PrimaryAction =>
  appStore === undefined
    ? { href: TRY_URL, label: "自分のスマホで試す" }
    : { href: appStore, label: "App Store で入手" };
