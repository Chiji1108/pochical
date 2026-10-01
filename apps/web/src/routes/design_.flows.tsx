import { createFileRoute } from "@tanstack/react-router";

import {
  CalendarFrame,
  Frame,
  FrameRow,
  FrameSection,
  frameSections,
} from "../components/design-frames";
import { GapSheetPreview, gapDaysIn } from "../components/design-gap-sheet";
import type { GapSheetProps } from "../components/design-gap-sheet";
import { DesignOnboarding } from "../components/design-onboarding";
import type { OnboardingScreen } from "../components/design-onboarding";
import {
  DesignIntro,
  DesignPage,
  DesignToolbar,
} from "../components/design-page";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { pageStyle } from "../components/design-theme";
import { OffDisplayContext } from "../components/shift-mark";
import { dateKey, initialDesignSchedule } from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import { isDayOff, presetPatterns } from "../lib/design-patterns";
import type { PatternBook } from "../lib/design-patterns";
import { parseDesignVariants } from "../lib/design-variants";
import { pageMeta } from "../lib/site";

export const Route = createFileRoute("/design_/flows")({
  component: FlowsPage,
  head: () => ({
    ...pageMeta(
      "画面遷移図",
      "ポチカルの画面の流れと分かれ道",
      "/design/flows",
      true
    ),
  }),
});

const variants = parseDesignVariants({});
const october = new Date(2026, 9, 1);
const OCTOBER = 9;
const OCTOBER_DAYS = 31;

function FlowsPage() {
  const theme = useDesignTheme();
  return (
    <DesignPage style={pageStyle(theme)}>
      <DesignToolbar back="documents" />
      <DesignIntro eyebrow="POCHICAL / FLOWS" title="画面遷移図">
        実際の画面を小さく並べています。触って試すときは、デモから。
      </DesignIntro>
      <DesignProviders>
        <div className={frameSections}>
          <FrameSection title="はじめての設定">
            <FrameRow>
              <OnboardingFrame label="最初の画面" screen="welcome" />
              <OnboardingFrame label="働き方" screen="kind" />
              <OnboardingFrame
                label="順番"
                note="決まった順番の人"
                screen="rotation"
              />
              <OnboardingFrame label="最初の日" screen="anchor" />
              <CalendarFrame
                label="カレンダー"
                note="1か月分が入る"
                person={{
                  rules: [
                    {
                      sequence: ["day", "day", "night", "after", "off", "off"],
                      start: new Date(2026, 7, 30),
                    },
                  ],
                }}
              />
            </FrameRow>
            <FrameRow branch="アカウントがある人">
              <OnboardingFrame label="ログイン" screen="login" />
              <CalendarFrame label="カレンダー" note="前のデータが戻る" />
            </FrameRow>
          </FrameSection>

          <FrameSection
            description="ポチポチ入力で空けた日を、完了のときにまとめて聞きます。"
            title="空いた日の確認"
          >
            <FrameRow>
              <CalendarFrame
                editing
                label="入力中"
                month={OCTOBER}
                note="休みの日を翌日へで空ける"
                person={{ schedule: partialOctober }}
              />
              <GapFrame label="完了を押すと" />
              <CalendarFrame
                label="カレンダー"
                month={OCTOBER}
                note="空いた日に休みが入る"
                person={{ schedule: filledGaps(partialOctober) }}
              />
            </FrameRow>
            <FrameRow branch="月が全部埋まるとき">
              <GapFrame label="確認" schedule={fullOctober} />
              <CalendarFrame
                label="カレンダー"
                month={OCTOBER}
                note="揃った月の保存のシートが開く"
                person={{ schedule: filledGaps(fullOctober) }}
              />
            </FrameRow>
            <FrameRow branch="人によって変わるところ" fan>
              <GapFrame
                label="共有していない人"
                note="グループの一文がない"
                sharing={false}
              />
              <OffDisplayContext value="blank">
                <GapFrame
                  label="休みを空白で見せている人"
                  note="空白のスイッチがない"
                  offerBlank={false}
                />
              </OffDisplayContext>
              <GapFrame
                choices={[
                  { key: "off", label: presetPatterns.off.name },
                  { key: "paid", label: presetPatterns.paid.name },
                ]}
                label="休みと有休がある人"
                note="入れるパターンを選べる"
              />
              <GapFrame
                choices={[]}
                label="休みを消した人"
                note="休みを戻して入れる"
              />
            </FrameRow>
          </FrameSection>

          <FrameSection title="設定">
            <FrameRow>
              <CalendarFrame label="設定" tab="settings" />
            </FrameRow>
            <FrameRow branch="それぞれの行から" fan>
              <CalendarFrame label="スタイル" page="mark" tab="settings" />
              <CalendarFrame label="外観" page="appearance" tab="settings" />
              <CalendarFrame
                label="アプリアイコン"
                page="appIcon"
                tab="settings"
              />
              <CalendarFrame label="カレンダー" page="week" tab="settings" />
              <CalendarFrame
                label="リマインド"
                page="reminders"
                tab="settings"
              />
              <CalendarFrame
                label="チャットの通知"
                page="chatNotifications"
                tab="settings"
              />
              <CalendarFrame label="アカウント" page="account" tab="settings" />
            </FrameRow>
          </FrameSection>
        </div>
      </DesignProviders>
    </DesignPage>
  );
}

function OnboardingFrame({
  label,
  note,
  screen,
}: {
  label: string;
  note?: string;
  screen: OnboardingScreen;
}) {
  return (
    <Frame label={label} note={note}>
      <DesignOnboarding initialScreen={screen} variants={variants} />
    </Frame>
  );
}

// October entered up to the 8th, with 3, 4 and 7 left blank by 翌日へ,
// and the whole of October with its days off left blank.
const partialOctober: Schedule = Object.fromEntries(
  (
    [
      [1, "day"],
      [2, "day"],
      [5, "night"],
      [6, "after"],
      [8, "day"],
    ] as const
  ).map(([day, shift]) => [dateKey(new Date(2026, OCTOBER, day)), { shift }])
);
// The samples' patterns are the ready-made ones.
const samplePatterns: PatternBook = presetPatterns;
const fullOctober: Schedule = Object.fromEntries(
  Object.entries(initialDesignSchedule(4, OCTOBER)).filter(
    ([, entry]) => entry && !isDayOff(samplePatterns[entry.shift])
  )
);

function filledGaps(schedule: Schedule): Schedule {
  return {
    ...schedule,
    ...Object.fromEntries(
      gapDaysIn(schedule, october).map((date) => [
        dateKey(date),
        { shift: "off" as const },
      ])
    ),
  };
}

// The calendar just left entering, with the blank days sheet open over
// it. What differs between people is passed in; the rest is the sample.
function GapFrame({
  label,
  note,
  schedule = partialOctober,
  ...sheet
}: {
  label: string;
  note?: string;
  schedule?: Schedule;
} & Partial<GapSheetProps>) {
  const days = gapDaysIn(schedule, october);
  const offCount = Object.values(schedule).filter(
    (entry) => entry && isDayOff(samplePatterns[entry.shift])
  ).length;
  const filled = Object.keys(schedule).length;
  return (
    <CalendarFrame
      label={label}
      month={OCTOBER}
      note={note}
      overlay={
        <GapSheetPreview
          blankOff={false}
          choices={[{ key: "off", label: presetPatterns.off.name }]}
          completes={filled + days.length === OCTOBER_DAYS}
          days={days}
          month={october}
          offCount={offCount}
          offerBlank
          onBlankOff={() => undefined}
          onFill={() => undefined}
          sharing
          {...sheet}
        />
      }
      person={{ schedule }}
    />
  );
}
