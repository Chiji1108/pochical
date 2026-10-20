import type { ColorScheme } from "@pochical/design/colors";
import { presets } from "@pochical/design/themes";
import {
  DesignProviders,
  PresetContexts,
  useDesignTheme,
} from "@pochical/prototype/components/design-providers";
import { shapeOptions } from "@pochical/prototype/components/design-settings-style";
import {
  ColorSchemeContext,
  pageStyle,
} from "@pochical/prototype/components/design-theme";
import type { PresetId } from "@pochical/prototype/components/design-theme";
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
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  CalendarFrame,
  FrameRow,
  FrameSection,
  frameSections,
} from "../components/design-frames";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/design_/states")({
  component: StatesPage,
  head: () => ({
    ...pageMeta(
      "状態の一覧",
      "ポチカルのカレンダーの、月の埋まり方や見た目ごとの状態",
      "/design/states",
      true
    ),
  }),
});

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

const patternCounts = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
const schemes: { scheme: ColorScheme; label: string }[] = [
  { label: "ライト", scheme: "light" },
  { label: "ダーク", scheme: "dark" },
];

// Every state a calendar can be in, side by side, so a change can be
// checked against all of them at once. Choices the person makes on the
// style page are fixed here per row; the rest follow the settings store.
function StatesPage() {
  const theme = useDesignTheme();
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / STATES" title="状態の一覧">
        カレンダーがなりうる状態を並べています。直したら、ここで全部を見比べます。
      </DesignIntro>
      <DesignProviders>
        <div className={frameSections}>
          <FrameSection title="月の埋まり方">
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
          </FrameSection>

          <FrameSection
            description="2026年8月。入力ボタンがいちばん場所をとる、入力中で比べます。"
            title="6段の月 × パターンの数"
          >
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
          </FrameSection>

          <FrameSection title="シフトの見た目">
            <FrameRow fan>
              {shapeOptions.map(({ fill, name, style }) => (
                <ShiftMarkStyleContext key={name} value={style}>
                  <IconWeightContext value={fill ? "duotone" : "regular"}>
                    <CalendarFrame label={name} />
                  </IconWeightContext>
                </ShiftMarkStyleContext>
              ))}
            </FrameRow>
          </FrameSection>

          <FrameSection title="休みの見せ方">
            <FrameRow fan>
              <OffLook label="強調" off="highlight" />
              <OffLook label="印だけ" off="mark" />
              <OffLook label="空白" off="blank" />
              <OffLook
                off="blank"
                editing
                label="空白で入力中"
                note="入力中は薄く出る"
              />
            </FrameRow>
          </FrameSection>

          <FrameSection title="テーマとライト・ダーク">
            {schemes.map(({ scheme, label: schemeLabel }) => (
              <FrameRow branch={schemeLabel} fan key={scheme}>
                {presets.map((preset) => (
                  <Scheme key={preset.id} preset={preset.id} scheme={scheme}>
                    <CalendarFrame label={preset.name} />
                  </Scheme>
                ))}
              </FrameRow>
            ))}
          </FrameSection>
        </div>
      </DesignProviders>
    </DesignPage>
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

function Scheme({
  scheme,
  preset,
  children,
}: {
  scheme: ColorScheme;
  preset: PresetId;
  children: ReactNode;
}) {
  return (
    <ColorSchemeContext value={scheme}>
      <PresetContexts id={preset}>{children}</PresetContexts>
    </ColorSchemeContext>
  );
}
