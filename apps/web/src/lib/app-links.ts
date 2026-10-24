// How an invitation's link reaches the Android app (spec/sync-protocol.md,
// Groups). https://pochical.app/invite/{code} opens the app as an App Link
// once Android has verified that this site names the app's signing
// certificates in /.well-known/assetlinks.json; until then, and wherever a
// link opens this site instead, the page's アプリで開く opens it.

export const ANDROID_PACKAGE = "app.pochical";

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

// アプリで開く for the invitation `code`: on Android an intent: link to the
// app, which Chrome opens in it, or in Play's page for it when it is not
// installed; elsewhere the app's own pochical://invite link, as iOS opens.
export const openInApp = (code: string, userAgent: string | null): string => {
  const path = `invite/${encodeURIComponent(code)}`;
  return userAgent !== null && ANDROID.test(userAgent)
    ? `intent://${path}#Intent;scheme=pochical;package=${ANDROID_PACKAGE};end`
    : `pochical://${path}`;
};
