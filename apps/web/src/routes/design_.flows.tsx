import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import {
  initialDesignSchedule,
  PhoneStatusBar,
} from "../components/design-calendar";
import {
  CalendarFrame,
  Frame,
  FrameRow,
  FrameSection,
} from "../components/design-frames";
import { ImportReviewPage } from "../components/design-import";
import type { ImportRun } from "../components/design-import";
import { DesignOnboarding } from "../components/design-onboarding";
import type { OnboardingScreen } from "../components/design-onboarding";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import { themeStyle, useThemeStyle } from "../components/design-theme";
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
                note="写真から取り込む"
                person={{ schedule: {} }}
              />
              <ImportFrame label="あなたの行" run="first" step="row" />
              <ImportFrame label="記号" run="first" step="codes" />
              <ImportFrame label="確かめる" run="first" step="check" />
              <CalendarFrame
                label="カレンダー"
                month={OCTOBER}
                note="1か月分が入る"
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

function ImportFrame({
  label,
  note,
  run,
  step,
}: {
  label: string;
  note?: string;
  run: ImportRun;
  step: "row" | "codes" | "check";
}) {
  return (
    <Frame label={label} note={note}>
      <PhoneShell>
        <ImportReviewPage
          coworkerNames={["田中", "鈴木", "山本", "高橋"]}
          initialStep={step}
          month={october}
          onApply={() => undefined}
          onCancel={() => undefined}
          patternKeys={["day", "night", "after", "off"]}
          run={run}
          schedule={{}}
        />
      </PhoneShell>
    </Frame>
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
