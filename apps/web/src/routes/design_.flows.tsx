import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import {
  dateKey,
  initialDesignSchedule,
  isDayOff,
  PhoneStatusBar,
} from "../components/design-calendar";
import type { Schedule } from "../components/design-calendar";
import {
  CalendarFrame,
  Frame,
  FrameRow,
  FrameSection,
} from "../components/design-frames";
import { GapSheetPreview, gapDaysIn } from "../components/design-gap-sheet";
import type { GapSheetProps } from "../components/design-gap-sheet";
import { ImportReviewPage } from "../components/design-import";
import type { ImportRun, ImportStep } from "../components/design-import";
import { ImportReading } from "../components/design-import-reading";
import { DesignOnboarding } from "../components/design-onboarding";
import type { OnboardingScreen } from "../components/design-onboarding";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { themeStyle, useThemeStyle } from "../components/design-theme";
import { OffDisplayContext } from "../components/shift-mark";
import { importSample } from "../lib/design-import-sample";
import type { ImportKind } from "../lib/design-import-sample";
import { patterns } from "../lib/design-patterns";
import { parseDesignVariants } from "../lib/design-variants";
import { pageMeta } from "../lib/site";

import designStyles from "../design.css?url";

export const Route = createFileRoute("/design_/flows")({
  component: FlowsPage,
  head: () => ({
    ...pageMeta(
      "画面遷移図",
      "ポチカルの画面の流れと分かれ道",
      "/design/flows",
      true
    ),
    links: [{ href: designStyles, rel: "stylesheet" }],
  }),
});

const variants = parseDesignVariants({});
const october = new Date(2026, 9, 1);
const OCTOBER = 9;
const OCTOBER_DAYS = 31;

function FlowsPage() {
  const theme = useDesignTheme();
  return (
    <main className="design-page" id="main" style={themeStyle(theme, "light")}>
      <div className="design-toolbar">
        <Link to="/design">
          <ArrowLeft aria-hidden="true" size={16} /> デザイン資料
        </Link>
      </div>
      <header className="design-intro">
        <p>POCHICAL / FLOWS</p>
        <h1>画面遷移図</h1>
        <p className="design-description">
          実際の画面を小さく並べています。触って試すときは、デモから。
        </p>
      </header>
      <DesignProviders>
        <div className="fl-flows">
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

          <FrameSection title="写真の取り込み">
            <FrameRow branch="初めて">
              <CalendarFrame
                label="カレンダー"
                month={OCTOBER}
                note="勤務表での名前を入れて撮る"
                person={{ schedule: {} }}
              />
              <ReadingFrame kind="roster" label="読み取り中" />
              <ImportFrame label="記号" run="first" step="codes" />
              <ImportFrame label="確かめる" run="first" step="check" />
              <ImportFrame
                coworkers
                label="一緒に働く人"
                note="入れたい人だけ選ぶ"
                run="first"
                scrollToEnd
                step="check"
              />
              <CalendarFrame
                label="カレンダー"
                month={OCTOBER}
                note="1か月分が入る"
                person={{ schedule: initialDesignSchedule(4, OCTOBER) }}
              />
            </FrameRow>
            <FrameRow branch="名前が見つからないとき">
              <ImportFrame
                label="あなたの行"
                note="一覧から選ぶ"
                rosterName="佐藤 花子"
                run="first"
                step="row"
              />
              <ImportFrame
                label="記号"
                rosterName="佐藤 花子"
                run="first"
                step="codes"
              />
            </FrameRow>
            <FrameRow branch="自分のシフトだけの写真">
              <ReadingFrame
                kind="mine"
                label="読み取り中"
                note="自分の分だけの表や画面"
              />
              <ImportFrame
                kind="mine"
                label="シフト名"
                run="first"
                step="codes"
              />
              <ImportFrame
                kind="mine"
                label="確かめる"
                run="first"
                step="check"
              />
              <CalendarFrame
                label="カレンダー"
                month={OCTOBER}
                person={{ schedule: initialDesignSchedule(4, OCTOBER) }}
              />
            </FrameRow>
            <FrameRow branch="2回目から">
              <ImportFrame
                label="確かめる"
                note="新しい記号だけ聞く"
                run="repeat"
                step="check"
              />
              <CalendarFrame
                label="カレンダー"
                month={OCTOBER}
                person={{ schedule: initialDesignSchedule(4, OCTOBER) }}
              />
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
                  { key: "off", label: patterns.off.label },
                  { key: "paid", label: patterns.paid.label },
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
              <CalendarFrame label="曜日と祝日" page="week" tab="settings" />
              <CalendarFrame label="アカウント" page="account" tab="settings" />
            </FrameRow>
          </FrameSection>
        </div>
      </DesignProviders>
    </main>
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

// The reading held on its last step, the days two readings disagree on marked.
function ReadingFrame({
  kind,
  label,
  note,
}: {
  kind: ImportKind;
  label: string;
  note?: string;
}) {
  return (
    <Frame label={label} note={note}>
      <PhoneShell>
        <ImportReading
          holdAt={3}
          kind={kind}
          month={october}
          onCancel={() => undefined}
          onDone={() => undefined}
          sample={importSample(kind, october)}
        />
      </PhoneShell>
    </Frame>
  );
}

function ImportFrame({
  kind,
  label,
  note,
  run,
  step,
  coworkers,
  scrollToEnd = false,
  rosterName = "小林 さくら",
}: {
  kind?: ImportKind;
  label: string;
  note?: string;
  run: ImportRun;
  step: ImportStep;
  coworkers?: boolean;
  // Showing the end of the page, where 一緒に働く人 sits.
  scrollToEnd?: boolean;
  // The name typed before the photo; one not on the sheet asks for the row.
  rosterName?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = frame.current?.querySelector(".st-scroll");
    if (scrollToEnd && scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [scrollToEnd]);
  return (
    <Frame label={label} note={note}>
      <div ref={frame}>
        <PhoneShell>
          <ImportReviewPage
            coworkerNames={["田中", "鈴木", "山本", "高橋"]}
            initialCoworkers={coworkers}
            initialStep={step}
            kind={kind}
            month={october}
            onApply={() => undefined}
            onCancel={() => undefined}
            patternKeys={["day", "night", "after", "off"]}
            rosterName={rosterName}
            run={run}
            schedule={{}}
          />
        </PhoneShell>
      </div>
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
const fullOctober: Schedule = Object.fromEntries(
  Object.entries(initialDesignSchedule(4, OCTOBER)).filter(
    ([, entry]) => entry && !isDayOff(entry.shift)
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
    (entry) => entry && isDayOff(entry.shift)
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
          choices={[{ key: "off", label: patterns.off.label }]}
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

// A phone around a page that does not bring its own.
function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="dc-phone" style={useThemeStyle()}>
      <PhoneStatusBar />
      {children}
      <div aria-hidden="true" className="dc-home-indicator" />
    </div>
  );
}
