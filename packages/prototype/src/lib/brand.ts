export const site = {
  description:
    "ポチポチ押すだけで、ひと月ぶんのシフトが埋まる。家族や友だちとも共有できるシフトカレンダー、ポチカル。",
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
  alt: "ポチカル シフトを、ポチッと。家族や友だちと共有できる、シフトカレンダー。",
  height: 630,
  width: 1200,
} as const;
