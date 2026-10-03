import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { monthAfter } from "../lib/design-days";
import type { PatternBook, Shift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { List, Section } from "./design-ui";

// What the settings pages share: their sections and rows, and the sample
// days their previews and examples count from.

export const previewDays = 14;

// Shortens runs of the same shift, e.g. 日勤×2・夕勤×2. An order from
// before may name a pattern deleted since.
export function sequenceLabel(sequence: Shift[], book: PatternBook) {
  const runs: { shift: Shift; count: number }[] = [];
  for (const shift of sequence) {
    const last = runs.at(-1);
    if (last?.shift === shift) {
      last.count += 1;
    } else {
      runs.push({ count: 1, shift });
    }
  }
  return runs
    .map(
      ({ shift, count }) =>
        `${book[shift]?.name ?? "削除したパターン"}${count > 1 ? `×${count}` : ""}`
    )
    .join("・");
}

export function shortDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export const settingsParts = {
  // A work style's emoji before its name, the size of a row's icon.
  styleIcon: css({
    fontFamily: "emoji",
    fontSize: "20px",
    lineHeight: 1,
  }),
  // A section's footer, as iOS sets explanation under a group of rows.
  footer: css({
    color: "text.tertiary",
    lineHeight: 1.5,
    margin: "8px 16px 0",
    textStyle: "footnote",
  }),
  // The app's version under the last list, as apps end their settings.
  version: css({
    color: "text.tertiary",
    margin: "16px 0 0",
    textAlign: "center",
    textStyle: "footnote",
  }),
  card: css({ bg: "fill.quaternary", borderRadius: "2xl", padding: "16px" }),
  cardCount: css({ color: "text.tertiary", fontWeight: 400 }),
  cardLabel: css({
    display: "flex",
    fontWeight: 600,
    justifyContent: "space-between",
    margin: "0 0 12px",
    textStyle: "footnote",
  }),
  cardMeta: css({
    color: "text.tertiary",
    margin: "12px 0 0",
    textStyle: "footnote",
  }),
  job: css({ display: "flex", flexDirection: "column", gap: "16px" }),
  marks: css({
    alignItems: "center",
    display: "inline-flex",
    gap: "4px",
    marginRight: "8px",
    verticalAlign: "middle",
  }),
  // The calendar as seen, on the screen's own ground, with 見本 on its
  // top edge. It may be drawn in the other of light and dark, so it sets
  // its own text color.
  preview: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "2xl",
    color: "text.primary",
    padding: "20px 8px 8px",
    pointerEvents: "none",
    position: "relative",
  }),
  previewHeading: css({ padding: "0 8px 8px" }),
  // The home screen's page of the preview: the wallpaper edge to edge,
  // the widget in the middle of it.
  // Where the home screen's page goes while its widgets load.
  homePreviewLoading: css({ borderRadius: "2xl", minHeight: "100%" }),
  // A form's row: what is set on the left, its value on the right.
  field: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  }),
  // A row's value with an icon before it, like the account's provider.
  inlineValue: css({
    alignItems: "center",
    display: "inline-flex",
    gap: "8px",
    justifyContent: "flex-end",
  }),
};

// A titled list of rows. A section whose content brings its own ground
// is a Section.
export function ListSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Section title={title}>
      <List>{children}</List>
    </Section>
  );
}

export function nextMonthStart() {
  return monthAfter(designToday, 1);
}
