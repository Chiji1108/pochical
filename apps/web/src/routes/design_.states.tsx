import type { ColorScheme } from "@pochical/design/colors";
import { presets } from "@pochical/design/themes";
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
import {
  DesignProviders,
  PresetContexts,
  useDesignTheme,
} from "../components/design-providers";
import {
  ColorSchemeContext,
  NoteMarkerContext,
  pageStyle,
} from "../components/design-theme";
import type { NoteMarkerLook, PresetId } from "../components/design-theme";
import {
  OffDisplayContext,
  OffHighlightContext,
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import type { OffDisplay, ShiftMarkStyle } from "../components/shift-mark";
import {
  dateKey,
  initialDesignSchedule,
  patternSets,
} from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import { presetList } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
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
const noHighlight = {
  highlight: { badge: false, emoji: false, icon: false },
};

// The sample September with memos on days off as well as on work days
// and today, to see a memo's stroke on a day off's tile and beside it.
const MEMO_DAYS_OFF = 3;
const memoSchedule = (() => {
  const schedule: Schedule = initialDesignSchedule();
  const daysOff = Object.keys(schedule)
    .filter((key) => schedule[key]?.shift === "off")
    .slice(0, MEMO_DAYS_OFF);
  for (const key of [...daysOff, dateKey(designToday)]) {
    const entry = schedule[key];
    if (entry) {
      schedule[key] = { ...entry, note: "メモ" };
    }
  }
  return schedule;
})();
const memoPerson = { schedule: memoSchedule };
const markerLooks: { look: NoteMarkerLook; label: string }[] = [
  { label: "グレー（今）", look: "gray" },
  { label: "テーマ色・休みの上で濃く", look: "tint" },
  { label: "テーマ色・いつも同じ濃さ", look: "tintEven" },
];
const markerThemes: { preset: PresetId; scheme: ColorScheme; label: string }[] =
  [
    { label: "ポチカル・ライト", preset: "pochical", scheme: "light" },
    { label: "ポチカル・ダーク", preset: "pochical", scheme: "dark" },
    { label: "墨・ライト", preset: "sumi", scheme: "light" },
    { label: "墨・ダーク", preset: "sumi", scheme: "dark" },
    { label: "月夜", preset: "tsukiyo", scheme: "dark" },
    { label: "喫茶", preset: "kissa", scheme: "dark" },
  ];

const patternCounts = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
const markStyles: { style: ShiftMarkStyle; label: string }[] = [
  { label: "アイコン", style: "icon" },
  { label: "絵文字", style: "emoji" },
  { label: "文字", style: "badge" },
];
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

          <FrameSection title="シフトの見せ方">
            <FrameRow fan>
              {markStyles.map(({ style, label }) => (
                <ShiftMarkStyleContext key={style} value={style}>
                  <CalendarFrame label={label} />
                </ShiftMarkStyleContext>
              ))}
            </FrameRow>
          </FrameSection>

          <FrameSection title="休みの見せ方">
            <FrameRow fan>
              <OffLook display="show" label="色をつける" />
              <OffLook display="show" highlight={false} label="色なし" />
              <OffLook display="blank" label="空白" />
              <OffLook
                display="blank"
                editing
                label="空白で入力中"
                note="入力中は薄く出る"
              />
            </FrameRow>
          </FrameSection>

          <FrameSection
            description="メモの日の印を比べます。休みの日（タイルの上）にもメモを入れています。"
            title="メモの印の色"
          >
            {markerThemes.map(({ preset, scheme, label: themeLabel }) => (
              <FrameRow branch={themeLabel} fan key={themeLabel}>
                {markerLooks.map(({ look, label }) => (
                  <NoteMarkerContext key={look} value={look}>
                    <Scheme preset={preset} scheme={scheme}>
                      <CalendarFrame label={label} person={memoPerson} />
                    </Scheme>
                  </NoteMarkerContext>
                ))}
              </FrameRow>
            ))}
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
  display,
  highlight = true,
  editing = false,
  label,
  note,
}: {
  display: OffDisplay;
  highlight?: boolean;
  editing?: boolean;
  label: string;
  note?: string;
}) {
  const frame = (
    <OffDisplayContext value={display}>
      <CalendarFrame editing={editing} label={label} note={note} />
    </OffDisplayContext>
  );
  if (highlight) {
    return frame;
  }
  return <OffHighlightContext value={noHighlight}>{frame}</OffHighlightContext>;
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
