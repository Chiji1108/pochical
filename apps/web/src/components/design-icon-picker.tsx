import {
  iconNames,
  iconSections,
  iconWords,
} from "@pochical/design/mark-icon-names";
import type { IconSection } from "@pochical/design/mark-icon-names";
import { useState } from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { pickerStyle } from "./design-picker-style";
import { Sheet, SheetHeading } from "./design-sheet";
import type { MarkIcon } from "./shift-mark";

// Every icon a mark can take, beyond the ones offered first: ほかのアイコン
// for a shift pattern or a group, in the same sheet as every emoji. The
// icons' names, words and kinds are shared (design/src/mark-icon-names.ts).

const KATAKANA = /[\u30A1-\u30F6]/gu;
const SPACES = /\s+/u;
const KANA_GAP = 0x60;

// Folds width, case and katakana, so ケア, けあ and ｹｱ find the same.
function folded(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(KATAKANA, (kana) =>
      String.fromCodePoint((kana.codePointAt(0) ?? 0) - KANA_GAP)
    );
}

function matching(query: string): readonly IconSection[] {
  const words = folded(query).split(SPACES).filter(Boolean);
  if (words.length === 0) {
    return iconSections;
  }
  return iconSections
    .map(({ title, icons }) => ({
      icons: icons.filter((icon) => {
        const text = folded(`${iconNames[icon]} ${iconWords[icon] ?? ""}`);
        return words.every((word) => text.includes(word));
      }),
      title,
    }))
    .filter(({ icons }) => icons.length > 0);
}

const sheet = {
  grid: css({
    display: "grid",
    gridTemplateColumns: "repeat(8, minmax(0, 1fr))",
    paddingInline: "2px",
  }),
  // The one picked now, edged like the picked tile in the grid.
  picked: css({
    "&[aria-pressed=true]": {
      boxShadow: "inset 0 0 0 1.5px token(colors.accent.default)",
    },
  }),
};

// The sheet over the phone; picking closes it.
export function IconPickerSheet({
  open,
  onOpenChange,
  picked,
  renderIcon,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  picked?: MarkIcon;
  // How each icon is drawn, in the pattern's or the group's color.
  renderIcon: (icon: MarkIcon) => ReactNode;
  onPick: (icon: MarkIcon) => void;
}) {
  const [query, setQuery] = useState("");
  const setOpen = (next: boolean) => {
    if (!next) {
      setQuery("");
    }
    onOpenChange(next);
  };
  const sections = matching(query);
  return (
    <Sheet label="アイコンを選ぶ" onOpenChange={setOpen} open={open}>
      <SheetHeading
        onClose={() => {
          setOpen(false);
        }}
        title="アイコンを選ぶ"
      />
      <div className={pickerStyle.root}>
        <input
          aria-label="アイコンを検索"
          className={pickerStyle.search}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="検索（例：夜勤、配達）"
          type="search"
          value={query}
        />
        <div className={pickerStyle.viewport}>
          {sections.length === 0 && (
            <p className={pickerStyle.note}>見つかりませんでした</p>
          )}
          {sections.map(({ title, icons }) => (
            <section aria-label={title} key={title}>
              <h3 className={pickerStyle.categoryHeader}>{title}</h3>
              <div className={sheet.grid}>
                {icons.map((icon) => (
                  <button
                    aria-label={iconNames[icon]}
                    aria-pressed={icon === picked}
                    className={`${pickerStyle.choice} ${sheet.picked}`}
                    key={icon}
                    onClick={() => {
                      onPick(icon);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    {renderIcon(icon)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
