import type { drawings } from "./drawings";

// The scene the stores' screenshots are photographed in (#806), which
// tools/store-screenshots/seed.ts puts on a server for the real apps and
// the prototype's samples draw for the site's top page
// (design-group-samples.ts): the two groups, their people with the
// drawings they show as their faces, and what the coworkers say. Each
// side keeps what only it needs: the seed its people's shifts, arranged
// from the day it runs, and the lines the top page leaves out; the
// samples their own shifts, on the prototype's fixed today.
type Person = { name: string; photo: (typeof drawings)[number]["id"] };

export const STORE_SCENE = {
  // Three coworkers who have not exchanged contacts, so they speak
  // politely: something small asked, and a meal fixed on a day they are
  // all off.
  coworkers: {
    emoji: "🏥",
    name: "職場のみんな",
    people: [
      { name: "田中", photo: "coffee" },
      { name: "小林", photo: "cat" },
      { name: "森", photo: "flower" },
    ],
    says: {
      asked: "すみません、モバイルバッテリー、休憩室にありますか…？",
      found: "ありましたよ！ロッカーの上に置いておきますね",
      meal: "今度のごはん会、みんなの休みが合う日で決めませんか？",
    },
  },
  // Friends from school, each at a workplace of their own.
  friends: {
    emoji: "🎓",
    name: "学生時代の友だち",
    people: [
      { name: "あや", photo: "rabbit" },
      { name: "みさき", photo: "penguin" },
      { name: "ゆうか", photo: "strawberry" },
    ],
  },
} as const satisfies Record<
  string,
  {
    emoji: string;
    name: string;
    people: readonly Person[];
    says?: Record<string, string>;
  }
>;
