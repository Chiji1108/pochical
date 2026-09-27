import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CornerDownRight } from "lucide-react";
import { Fragment, useState } from "react";
import type { ReactNode } from "react";

import {
  DesignCalendar,
  initialDesignSchedule,
  PhoneStatusBar,
} from "../components/design-calendar";
import type { Tab } from "../components/design-calendar";
import { ImportReviewPage } from "../components/design-import";
import type { ImportRun } from "../components/design-import";
import { DesignOnboarding } from "../components/design-onboarding";
import type { OnboardingScreen } from "../components/design-onboarding";
import {
  DesignProviders,
  useDesignTheme,
} from "../components/design-providers";
import type { SettingsPage } from "../components/design-settings";
import { themeStyle, useThemeStyle } from "../components/design-theme";
import { createUserStore, UserStoreContext } from "../lib/design-user-store";
import type { OwnData } from "../lib/design-user-store";
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

// Every frame is the real screen, drawn small and not touchable, so the
// diagram never drifts from the app. Frames open on their screen through
// the components' initial props.
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
          <Flow title="はじめての設定">
            <FlowRow>
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
            </FlowRow>
            <FlowRow branch="アカウントがある人">
              <OnboardingFrame label="ログイン" screen="login" />
              <CalendarFrame label="カレンダー" note="前のデータが戻る" />
            </FlowRow>
          </Flow>

          <Flow title="写真の取り込み">
            <FlowRow branch="初めて">
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
            </FlowRow>
            <FlowRow branch="2回目から">
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
            </FlowRow>
          </Flow>

          <Flow title="設定">
            <FlowRow>
              <CalendarFrame label="設定" tab="settings" />
            </FlowRow>
            <FlowRow branch="それぞれの行から" fan>
              <CalendarFrame label="スタイル" page="mark" tab="settings" />
              <CalendarFrame label="外観" page="appearance" tab="settings" />
              <CalendarFrame
                label="アプリアイコン"
                page="appIcon"
                tab="settings"
              />
              <CalendarFrame label="曜日と祝日" page="week" tab="settings" />
              <CalendarFrame label="アカウント" page="account" tab="settings" />
            </FlowRow>
          </Flow>
        </div>
      </DesignProviders>
    </main>
  );
}

function Flow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="fl-flow">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// Frames in order with arrows between, or with `fan`, the pages one step
// branches out to, side by side without arrows.
function FlowRow({
  branch,
  fan = false,
  children,
}: {
  branch?: string;
  fan?: boolean;
  children: ReactNode[] | ReactNode;
}) {
  const frames = Array.isArray(children) ? children : [children];
  return (
    <div className="fl-row-wrap">
      {branch && (
        <p className="fl-branch">
          <CornerDownRight aria-hidden="true" size={14} />
          {branch}
        </p>
      )}
      <ol className={`fl-row ${fan ? "fl-fan" : ""}`}>
        {frames.map((frame, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- frames never move
          <Fragment key={index}>
            {index > 0 && !fan && (
              <li aria-hidden="true" className="fl-arrow">
                <ArrowRight size={18} />
              </li>
            )}
            <li>{frame}</li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}

// One screen, drawn at phone size and scaled down, with its name under it.
function Frame({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <figure className="fl-frame">
      <div className="fl-screen">
        <div className="fl-inner" inert>
          {children}
        </div>
      </div>
      <figcaption>
        <strong>{label}</strong>
        {note && <small>{note}</small>}
      </figcaption>
    </figure>
  );
}

// The sample person's own data, for frames that need nothing special.
const samplePerson: Partial<OwnData> = {};

function CalendarFrame({
  label,
  note,
  person = samplePerson,
  month,
  tab,
  page,
}: {
  label: string;
  note?: string;
  person?: Partial<OwnData>;
  month?: number;
  tab?: Tab;
  page?: SettingsPage;
}) {
  const [store] = useState(() =>
    createUserStore({ schedule: initialDesignSchedule(), ...person })
  );
  return (
    <Frame label={label} note={note}>
      <UserStoreContext value={store}>
        <DesignCalendar
          initialEditing={false}
          initialMonth={month}
          initialSettingsPage={page}
          initialTab={tab}
          variants={variants}
        />
      </UserStoreContext>
    </Frame>
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
