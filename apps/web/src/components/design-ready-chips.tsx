import { readyPatternSections } from "@pochical/design/patterns";
import { useContext } from "react";
import { css } from "styled-system/css";

import { presetPatterns } from "../lib/design-patterns";
import type { PresetShift } from "../lib/design-patterns";
import { Chip, ChipGroup } from "./design-choices";
import { MarkGlyph, ShiftMarkStyleContext } from "./shift-mark";

// The ready-made patterns as chips under their headings (design/src/
// patterns.ts, readyPatternSections), for picking several at once: the
// setup questions' 勤務や休みを選んでください and パターンを追加.

// The ids picked, in the order the chips show them.
export function inChipOrder(picked: ReadonlySet<PresetShift>): PresetShift[] {
  return readyPatternSections
    .flatMap(({ ids }) => ids)
    .filter((id) => picked.has(id));
}

// Whether the id is one of the ready-made patterns'.
function isPreset(id: string | undefined): id is PresetShift {
  return id !== undefined && id in presetPatterns;
}

// The set with the id picked or no longer. Picking a pattern with a next
// day picks that too, as 夜勤 brings its 明け and 当番 its 非番, which can
// still be dropped on its own.
export function toggled(
  picked: ReadonlySet<PresetShift>,
  id: PresetShift
): ReadonlySet<PresetShift> {
  const next = new Set(picked);
  if (next.has(id)) {
    next.delete(id);
    return next;
  }
  next.add(id);
  const follows = presetPatterns[id].nextDay;
  if (isPreset(follows)) {
    next.add(follows);
  }
  return next;
}

const nothingNeeded: ReadonlySet<PresetShift> = new Set();

const everyOffered = () => true;

export function ReadyPatternChips({
  picked,
  needed = nothingNeeded,
  offered = everyOffered,
  onToggle,
}: {
  picked: ReadonlySet<PresetShift>;
  // Ones that stay picked, drawn as picked, not greyed out as a choice
  // there is none of.
  needed?: ReadonlySet<PresetShift>;
  // The ones to show; a heading left with none goes.
  offered?: (id: PresetShift) => boolean;
  onToggle: (id: PresetShift) => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const sections = readyPatternSections
    .map(({ title, ids }) => ({ ids: ids.filter(offered), title }))
    .filter(({ ids }) => ids.length > 0);
  return (
    <>
      {sections.map((section) => (
        <section className={chips.section} key={section.title}>
          <h4 className={chips.heading}>{section.title}</h4>
          <ChipGroup label={section.title}>
            {section.ids.map((id) => {
              const pattern = presetPatterns[id];
              return (
                <Chip
                  aria-disabled={needed.has(id)}
                  key={id}
                  onClick={() => {
                    if (!needed.has(id)) {
                      onToggle(id);
                    }
                  }}
                  selected={picked.has(id)}
                >
                  <MarkGlyph look={pattern} size={16} style={style} />
                  {pattern.name}
                </Chip>
              );
            })}
          </ChipGroup>
        </section>
      ))}
    </>
  );
}

const chips = {
  heading: css({
    color: "text.tertiary",
    fontWeight: 600,
    margin: "0 0 8px",
    textStyle: "footnote",
  }),
  section: css({ display: "flex", flexDirection: "column" }),
};
