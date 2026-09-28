import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  initialDesignSchedule,
  patternSets,
} from "../components/design-calendar";
import {
  CalendarFrame,
  FrameRow,
  FrameSection,
} from "../components/design-frames";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import {
  ColorSchemeContext,
  themeStyle,
  ToneContext,
} from "../components/design-theme";
import {
  OffDisplayContext,
  OffHighlightContext,
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import type { OffDisplay, ShiftMarkStyle } from "../components/shift-mark";
import type { ColorScheme, Tone } from "../lib/design-tokens";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

export const Route = createFileRoute("/design_/states")({
  component: StatesPage,
  head: () => ({
    ...pageMeta(
      "状態の一覧",
      "ポチカルのカレンダーの、月の埋まり方や見た目ごとの状態",
      "/design/states",
      true
    ),
    links: [{ href: designStyles, rel: "stylesheet" }],
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

const patternCounts = [4, 5, 6, 8] as const;
const markStyles: { style: ShiftMarkStyle; label: string }[] = [
  { label: "アイコン", style: "icon" },
  { label: "絵文字", style: "emoji" },
  { label: "文字", style: "badge" },
];
const toneLabels: { tone: Tone; label: string }[] = [
  { label: "深め", tone: "deep" },
  { label: "紙", tone: "paper" },
  { label: "くすみ", tone: "dusty" },
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
    <DesignPage style={themeStyle(theme, "light")}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / STATES" title="状態の一覧">
        カレンダーがなりうる状態を並べています。直したら、ここで全部を見比べます。
      </DesignIntro>
      <DesignProviders>
        <div className="fl-flows">
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
                    patternKeys: patternSets[count],
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

          <FrameSection title="トーンとライト・ダーク">
            {schemes.map(({ scheme, label: schemeLabel }) => (
              <FrameRow branch={schemeLabel} fan key={scheme}>
                {toneLabels.map(({ tone, label }) => (
                  <Scheme key={tone} scheme={scheme} tone={tone}>
                    <CalendarFrame label={label} />
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
  tone,
  children,
}: {
  scheme: ColorScheme;
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <ColorSchemeContext value={scheme}>
      <ToneContext value={tone}>{children}</ToneContext>
    </ColorSchemeContext>
  );
}
