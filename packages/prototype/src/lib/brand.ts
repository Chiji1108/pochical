export const site = {
  description:
    "夜勤や交代勤務のある人のシフトカレンダー、ポチカル。勤務表を見ながらポチポチ押すだけで、ひと月ぶんのシフトが入ります。家族や友人とも共有できます。",
  email: "support@pochical.app",
  name: "ポチカル",
};

// Where the app's source and its design documents are open to read,
// linked from the site (apps/web) and the documents (apps/design).
export const sourceUrl = "https://github.com/Chiji1108/pochical";
export const designUrl = "https://design.pochical.app";

// The picture shared links show (og:image), at the size previews expect:
// assets/share.png, taken from apps/design's /_render/share-image by pnpm
// run image:share.
export const SHARE_IMAGE = {
  alt: "ポチカル シフトを、ポチッと。夜勤や交代勤務のある人の、シフトカレンダー。",
  height: 630,
  width: 1200,
} as const;
