// iOS's text styles at their default size, which the native apps take as
// .font(.body) and so on and grow with the reader's text size; Compose
// maps each onto its type scale in sp. Each sets a size, and headline its
// weight; a piece may still set a weight of its own, as iOS's emphasized
// styles do. What is drawn to a fixed size, like a day in the month or a
// mark, keeps its own size instead.
export const textStyles = {
  body: { size: 17, weight: 400 },
  callout: { size: 16, weight: 400 },
  caption: { size: 12, weight: 400 },
  caption2: { size: 11, weight: 400 },
  footnote: { size: 13, weight: 400 },
  headline: { size: 17, weight: 600 },
  largeTitle: { size: 34, weight: 400 },
  subheadline: { size: 15, weight: 400 },
  title1: { size: 28, weight: 400 },
  title2: { size: 22, weight: 400 },
  title3: { size: 20, weight: 400 },
} as const;

export type TextStyle = keyof typeof textStyles;

// フォント in スタイル: the face the app's own words and numbers are drawn
// in. A few that differ at a glance, not several gothics that barely do.
// The system's is the default and needs nothing; the others are open
// fonts (Google Fonts) that the app fetches when one is picked rather
// than carrying them, as each Japanese face is megabytes. The OS's own
// pieces, like the status bar or a notification, keep the system's.
export const fonts = [
  { family: null, id: "system", name: "標準", weights: [] },
  {
    family: "Zen Maru Gothic",
    id: "maru",
    name: "丸ゴシック",
    weights: [400, 500, 700],
  },
  {
    family: "Shippori Mincho",
    id: "mincho",
    name: "明朝",
    weights: [400, 600, 700],
  },
  // A pen's hand, as a textbook writes it: still easy to read small. It
  // has no bold, so what is bold elsewhere stays at 600.
  { family: "Klee One", id: "tegaki", name: "手書き", weights: [400, 600] },
] as const;

export type FontId = (typeof fonts)[number]["id"];
