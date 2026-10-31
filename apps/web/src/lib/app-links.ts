// How the site's links reach the app (spec/sync-protocol.md, Groups;
// spec/calendar.md): an invitation's, https://pochical.app/invite/{code},
// and a day's, https://pochical.app/day/{yyyy-mm-dd}, as a device
// calendar's event carries it. They open the app as an App Link once Android
// has verified that this site names the app's signing certificates in
// /.well-known/assetlinks.json, and as a Universal Link once iOS has read
// that the site names the app in /.well-known/apple-app-site-association;
// until then, and wherever a link opens this site instead, the page's
// アプリで開く opens it.

export const ANDROID_PACKAGE = "app.pochical";

// The iOS app, by its team's id and its bundle id.
export const APPLE_APP_ID = "6KC44WPYLJ.app.pochical";

// The site's paths the app opens, as the Android manifest's App Link filter
// names them too.
const APP_PATHS = ["/invite/*", "/day/*"] as const;

type AppleAppSiteAssociation = {
  applinks: {
    details: { appIDs: string[]; components: { "/": string }[] }[];
  };
};

// The Universal Links statement that lets the iOS app open the site's links.
export const appleAppSiteAssociation = (): AppleAppSiteAssociation => ({
  applinks: {
    details: [
      {
        appIDs: [APPLE_APP_ID],
        components: APP_PATHS.map((path) => ({ "/": path })),
      },
    ],
  },
});

// The SHA-256 fingerprints of the certificates the Android app is signed
// with, as Play Console shows them (Test and release › App integrity › Play
// app signing): the app signing key's, which signs every install from Play,
// and the upload key's, which signs a bundle before Play re-signs it. Public
// values, not secrets.
export const ANDROID_CERTIFICATES: readonly string[] = [
  // App signing key
  "50:B4:DE:07:E3:66:31:AB:D2:04:CE:69:A9:B1:70:73:6E:FE:C2:35:A8:75:FC:E5:A1:8F:C7:3F:89:E5:0A:96",
  // Upload key
  "35:01:A7:F8:4A:DB:96:7A:00:53:41:89:8F:94:E6:59:95:9D:18:5B:A7:EA:A7:AF:E0:D6:7B:22:90:E5:BA:B1",
];

type AssetLink = {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

// The Digital Asset Links statement that lets the app handle the site's
// links, none while no certificate is named.
export const assetLinks = (
  certificates: readonly string[] = ANDROID_CERTIFICATES
): AssetLink[] =>
  certificates.length === 0
    ? []
    : [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: ANDROID_PACKAGE,
            sha256_cert_fingerprints: [...certificates],
          },
        },
      ];

const ANDROID = /\bAndroid\b/u;

// アプリで開く for the app's own link `pochical://{path}`, as
// `invite/{code}` or `day/{yyyy-mm-dd}`: on Android an intent: link to the
// app, which Chrome opens in it, or in Play's page for it when it is not
// installed; elsewhere the app's own link, as iOS opens.
export const openInApp = (path: string, userAgent: string | null): string =>
  userAgent !== null && ANDROID.test(userAgent)
    ? `intent://${path}#Intent;scheme=pochical;package=${ANDROID_PACKAGE};end`
    : `pochical://${path}`;

const DAY = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

// The day a day link names, `yyyy-mm-dd`, as a date at midnight in UTC;
// none for text that is not one, or a date that is no day.
export const linkedDay = (text: string): Date | undefined => {
  const named = DAY.exec(text)?.groups;
  if (named === undefined) {
    return undefined;
  }
  const [year, month, day] = [named.year, named.month, named.day].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : undefined;
};
