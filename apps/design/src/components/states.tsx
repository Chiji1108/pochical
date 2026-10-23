import type { ColorScheme } from "@pochical/design/colors";
import { presets } from "@pochical/design/themes";
import { PresetContexts } from "@pochical/prototype/components/design-providers";
import { shapeOptions } from "@pochical/prototype/components/design-settings-style";
import { ColorSchemeContext } from "@pochical/prototype/components/design-theme";
import {
  IconWeightContext,
  noOffLooks,
  OffLooksContext,
  ShiftMarkStyleContext,
} from "@pochical/prototype/components/shift-mark";
import type { OffLookId } from "@pochical/prototype/components/shift-mark";
import {
  initialDesignSchedule,
  patternSets,
} from "@pochical/prototype/lib/design-days";
import { presetList } from "@pochical/prototype/lib/design-patterns";

import { CalendarFrame, FrameRow } from "./design-frames";

// The rows of content/design/states.mdx: every state a calendar can be in,
// side by side, so a change can be checked against all of them at once.
// Choices the person makes on the style page are fixed here per row; the
// rest follow the settings.

// August 2026 starts on a Saturday, so it is six weeks tall.
const AUGUST = 7;
const PARTIAL_DAYS = 12;

// The sample September, entered only up to the 12th.
const partialSchedule = Object.fromEntries(
  Object.entries(initialDesignSchedule()).filter(
    ([key]) => Number(key.slice(-2)) <= PARTIAL_DAYS
  )
);
const emptyPerson = { schedule: {} };
const partialPerson = { schedule: partialSchedule };

export function MonthFill() {
  return (
    <FrameRow fan>
      <CalendarFrame label="何もない月" person={emptyPerson} />
      <CalendarFrame
        label="途中まで"
        note={`${PARTIAL_DAYS}日まで入っている`}
        person={partialPerson}
      />
      <CalendarFrame label="埋まった月" />
      <CalendarFrame
        editing
        label="入力中"
        note="途中までの月"
        person={partialPerson}
      />
    </FrameRow>
  );
}

const patternCounts = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export function PatternCounts() {
  return (
    <FrameRow fan>
      {patternCounts.map((count) => (
        <CalendarFrame
          editing
          key={count}
          label={`${count}パターン`}
          month={AUGUST}
          person={{
            patterns: presetList(patternSets[count]),
            schedule: initialDesignSchedule(count, AUGUST),
          }}
        />
      ))}
    </FrameRow>
  );
}

export function ShiftShapes() {
  return (
    <FrameRow fan>
      {shapeOptions.map(({ fill, name, style }) => (
        <ShiftMarkStyleContext key={name} value={style}>
          <IconWeightContext value={fill ? "duotone" : "regular"}>
            <CalendarFrame label={name} />
          </IconWeightContext>
        </ShiftMarkStyleContext>
      ))}
    </FrameRow>
  );
}

function OffLook({
  off,
  editing = false,
  label,
  note,
}: {
  off: OffLookId;
  editing?: boolean;
  label: string;
  note?: string;
}) {
  return (
    <OffLooksContext value={{ off, offs: noOffLooks }}>
      <CalendarFrame editing={editing} label={label} note={note} />
    </OffLooksContext>
  );
}

export function OffLooks() {
  return (
    <FrameRow fan>
      <OffLook label="強調" off="highlight" />
      <OffLook label="印だけ" off="mark" />
      <OffLook label="空白" off="blank" />
      <OffLook
        editing
        label="空白で入力中"
        note="入力中は薄く出る"
        off="blank"
      />
    </FrameRow>
  );
}

// Every テーマ in light or in dark, whatever the page's own 外観.
export function Themes({ scheme }: { scheme: ColorScheme }) {
  return (
    <FrameRow fan>
      {presets.map((preset) => (
        <ColorSchemeContext key={preset.id} value={scheme}>
          <PresetContexts id={preset.id}>
            <CalendarFrame label={preset.name} />
          </PresetContexts>
        </ColorSchemeContext>
      ))}
    </FrameRow>
  );
}
