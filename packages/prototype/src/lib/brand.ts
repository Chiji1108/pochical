export const site = {
  description:
    "ポチポチ押すだけで、ひと月ぶんのシフトが埋まる。家族や友だちとも共有できるシフトカレンダー、ポチカル。",
  email: "support@pochical.app",
  name: "ポチカル",
};

// The picture shared links show (og:image), at the size previews expect:
// assets/share.png, taken from apps/catalog's /_render/share-image by bun
// run image:share.
export const SHARE_IMAGE = {
  alt: "ポチカル シフトを、ポチッと。家族や友だちと共有できる、シフトカレンダー。",
  height: 630,
  width: 1200,
} as const;
