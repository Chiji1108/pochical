import type { Shift } from "./design-patterns";

// What the prototype pretends a photo read. Two kinds of picture come in:
// a roster, everyone's month on one sheet with a row each, and one
// person's own month: a sheet handed to them alone, another shift app's
// screen, a message listing their days, a note they wrote.
export type ImportKind = "roster" | "mine";

export type ReadRow = {
  // The name as the photo has it, and as the reading took it.
  printed: string;
  read: string;
  // Whether the reading was unsure of the name.
  unsure: boolean;
  codes: string[];
};

export type ImportSample = {
  rows: ReadRow[];
  // Which row is yours, once known: a picture of your own month has only
  // yours.
  myRow: number;
  // Days whose code the reading was unsure of, on your row.
  unsureDays: number[];
  // Codes the reading pairs with a pattern by itself.
  suggestions: Record<string, Shift>;
  // Codes a returning person has already placed.
  knownCodes: string[];
};

const rosterCycle = ["日", "日", "夜", "明", "休", "休"];
const mineCycle = ["早番", "早番", "遅番", "遅番", "休み", "日勤", "休み"];

function codesOf(
  month: Date,
  cycle: string[],
  offset: number,
  extra: Record<number, string>
) {
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from(
    { length: days },
    (_, index) =>
      extra[index + 1] ??
      cycle[(index + offset) % cycle.length] ??
      cycle[0] ??
      ""
  );
}

export function importSample(kind: ImportKind, month: Date): ImportSample {
  if (kind === "mine") {
    return {
      knownCodes: ["早番", "遅番", "休み", "日勤"],
      myRow: 0,
      rows: [
        {
          codes: codesOf(month, mineCycle, 0, { 15: "有休" }),
          printed: "",
          read: "",
          unsure: false,
        },
      ],
      suggestions: {
        休み: "off",
        日勤: "day",
        早番: "early",
        有休: "paid",
        遅番: "late",
      },
      unsureDays: [9],
    };
  }
  const row = (
    printed: string,
    offset: number,
    extra: Record<number, string>,
    read = printed
  ): ReadRow => ({
    codes: codesOf(month, rosterCycle, offset, extra),
    printed,
    read,
    unsure: read !== printed,
  });
  return {
    knownCodes: ["日", "夜", "明", "休", "有"],
    myRow: 0,
    rows: [
      row("小林 さくら", 0, { 16: "研", 29: "有" }),
      row("田中 みき", 5, {}),
      row("鈴木 ゆい", 0, { 8: "有" }),
      // Two names the reading got wrong, and knew it was unsure of.
      row("山本 あや", 1, {}, "山木 あや"),
      row("高橋 りな", 1, { 16: "研" }),
      row("中村 はるか", 5, {}, "中材 はるか"),
    ],
    suggestions: {
      休: "off",
      夜: "night",
      日: "day",
      明: "after",
      有: "paid",
      研: "training",
    },
    unsureDays: [12, 19],
  };
}

// The family name a coworker is registered under, as the app lists them.
export const familyName = (name: string) => name.split(" ")[0] ?? name;

// A registered coworker a misread family name is one letter away from,
// to offer as the fix. Of several, one starting the same way reads more
// like it: 山木 is 山本 sooner than 鈴木.
export function nearCoworker(name: string, coworkers: string[]) {
  const family = [...familyName(name)];
  if (coworkers.includes(family.join(""))) {
    return undefined;
  }
  const near = coworkers.filter((other) => {
    const letters = [...other];
    return (
      letters.length === family.length &&
      letters.filter((letter, index) => letter !== family[index]).length === 1
    );
  });
  return near.find((other) => other.startsWith(family[0] ?? "")) ?? near[0];
}

// Letters to change to turn one name into another, spacing aside.
function nameDistance(a: string, b: string) {
  const plain = (name: string) => [...name.replaceAll(/\s/gu, "")];
  const from = plain(a);
  const to = plain(b);
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);
  for (const [i, letter] of from.entries()) {
    const current = [i + 1];
    for (const [j, other] of to.entries()) {
      current.push(
        Math.min(
          (previous[j + 1] ?? 0) + 1,
          (current[j] ?? 0) + 1,
          (previous[j] ?? 0) + (letter === other ? 0 : 1)
        )
      );
    }
    previous = current;
  }
  return previous.at(-1) ?? 0;
}

// The row whose name, as read, is nearest the name the person typed: a
// letter or two misread still finds them. None when every name is far
// off, and the person picks their row from the list instead.
export function rowByName(rows: ReadRow[], typed: string) {
  let found: { index: number; distance: number } | undefined;
  for (const [index, row] of rows.entries()) {
    const distance = nameDistance(row.read, typed);
    if (found === undefined || distance < found.distance) {
      found = { distance, index };
    }
  }
  return found !== undefined && found.distance <= 2 ? found.index : undefined;
}
