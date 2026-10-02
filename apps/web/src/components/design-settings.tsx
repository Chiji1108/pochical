import { ArrowUpRight } from "lucide-react";
import { useContext, useState } from "react";

import { isRepeating } from "../lib/design-days";
import type { RepeatRule, Schedule } from "../lib/design-days";
import { APP_VERSION, useDevice } from "../lib/design-device";
import type { Pattern, Shift } from "../lib/design-patterns";
import { site } from "../lib/site";
import { CoworkersPage, useCoworkerList } from "./design-coworkers";
import type { Profile } from "./design-group-data";
import { PhotoAvatar } from "./design-group-parts";
import {
  ChatNotificationsPage,
  NotificationSection,
  RemindersPage,
} from "./design-notifications";
import { PatternsPage } from "./design-pattern-editor";
import {
  AccountPage,
  AccountRow,
  ProfilePage,
} from "./design-settings-account";
import {
  AppearancePage,
  AppearanceRow,
  AppIconPage,
  AppIconRow,
  WeekPage,
  WeekRow,
} from "./design-settings-display";
import { ListSection, settingsParts } from "./design-settings-parts";
import { stylePreviewOf } from "./design-settings-preview";
import { MarkPage, StyleRow } from "./design-settings-style";
import {
  JobChangePage,
  RepeatEditorPage,
  RosterSwitchPage,
  WorkStylePage,
} from "./design-settings-work";
import { SupportChatPage, SupportRow } from "./design-support-chat";
import { TabBar } from "./design-tab-bar";
import type { Tab } from "./design-tab-bar";
import { ToastContext } from "./design-toast";
import {
  ListRow,
  listRow,
  PageHeader,
  Screen,
  ScreenScroll,
} from "./design-ui";
import { useWeek } from "./design-week";
import { ShiftMark } from "./shift-mark";

export type SettingsPage = Page;

type Page =
  | "top"
  | "repeat-new"
  | "repeat-fix"
  | "job"
  | "work"
  | "roster"
  | "patterns"
  | "coworkers"
  | "mark"
  | "appearance"
  | "week"
  | "appIcon"
  | "account"
  | "profile"
  | "reminders"
  | "chatNotifications"
  | "support";

const holidayWeekDay = new Date(2026, 8, 21);

export function DesignSettings({
  patterns,
  rules,
  schedule,
  profile,
  onProfile,
  onApplyRule,
  onFixRule,
  onChangeJob,
  onHolidaysOff,
  onTab,
  initialPage = "top",
}: {
  patterns: Pattern[];
  rules: RepeatRule[];
  schedule: Schedule;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onApplyRule: (rule: RepeatRule) => void;
  onFixRule: (rule: RepeatRule) => void;
  onChangeJob: (job: { patterns: Pattern[]; rule: RepeatRule }) => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
  onTab: (tab: Tab) => void;
  // For the flow diagrams: a page to open on.
  initialPage?: Page;
}) {
  const coworkers = useCoworkerList();
  const [page, setPage] = useState<Page>(initialPage);
  const weekTools = useWeek();
  const patternKeys = patterns.map((pattern) => pattern.id);
  const preview = stylePreviewOf(patterns, weekTools.weekDates);
  // From the week holding the 21st, so all three holidays of the 21st to
  // 23rd fall in the fortnight whatever day the week starts on.
  const weekPreview = stylePreviewOf(
    patterns,
    weekTools.weekDates,
    holidayWeekDay
  );
  const repeating = isRepeating(rules);
  const current = repeating ? rules.at(-1) : undefined;
  // The order to start from when repeating again.
  const lastSequence =
    [...rules].reverse().find((rule) => rule.sequence.length > 0)?.sequence ??
    [];
  // A chat fills the screen, its composer where the tab bar was, as the
  // group chats do.
  if (page === "support") {
    return (
      <SupportChatPage
        onBack={() => {
          setPage("top");
        }}
      />
    );
  }
  return (
    <Screen>
      <ScreenScroll>
        {page === "top" && (
          <SettingsTop
            coworkerCount={coworkers.names.length}
            current={current}
            onOpen={setPage}
            patternKeys={patternKeys}
            profile={profile}
          />
        )}
        {page === "profile" && (
          <ProfilePage
            onBack={() => {
              setPage("top");
            }}
            onChange={onProfile}
            profile={profile}
          />
        )}
        {page === "repeat-new" && (
          <RepeatEditorPage
            initialSequence={lastSequence}
            mode={current ? "switch" : "first"}
            onApply={(rule) => {
              onApplyRule(rule);
              setPage(current ? "work" : "top");
            }}
            onBack={() => {
              setPage("work");
            }}
            patternKeys={patternKeys}
          />
        )}
        {page === "repeat-fix" && current && (
          <RepeatEditorPage
            current={current}
            initialSequence={current.sequence}
            mode="fix"
            onApply={(rule) => {
              onFixRule(rule);
              setPage("work");
            }}
            onBack={() => {
              setPage("work");
            }}
            patternKeys={patternKeys}
          />
        )}
        {page === "job" && (
          <JobChangePage
            onApply={(job) => {
              onChangeJob(job);
              setPage("work");
            }}
            onBack={() => {
              setPage("work");
            }}
          />
        )}
        {page === "work" && (
          <WorkStylePage
            onBack={() => {
              setPage("top");
            }}
            onFix={() => {
              setPage("repeat-fix");
            }}
            onHolidaysOff={onHolidaysOff}
            onJob={() => {
              setPage("job");
            }}
            onNew={() => {
              setPage("repeat-new");
            }}
            onRepeat={() => {
              setPage("repeat-new");
            }}
            onRoster={() => {
              setPage("roster");
            }}
            rules={rules}
          />
        )}
        {page === "roster" && (
          <RosterSwitchPage
            onApply={(start) => {
              onApplyRule({ sequence: [], start });
              setPage("top");
            }}
            onBack={() => {
              setPage("work");
            }}
          />
        )}
        {page === "mark" && (
          <MarkPage
            onBack={() => {
              setPage("top");
            }}
            preview={preview}
          />
        )}
        {page === "week" && (
          <WeekPage
            onBack={() => {
              setPage("top");
            }}
            preview={weekPreview}
          />
        )}
        {page === "appIcon" && (
          <AppIconPage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "account" && (
          <AccountPage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "appearance" && (
          <AppearancePage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "coworkers" && (
          <CoworkersPage
            coworkers={coworkers}
            onBack={() => {
              setPage("top");
            }}
            schedule={schedule}
          />
        )}
        {page === "patterns" && (
          <PatternsPage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "reminders" && (
          <RemindersPage
            onBack={() => {
              setPage("top");
            }}
            schedule={schedule}
          />
        )}
        {page === "chatNotifications" && (
          <ChatNotificationsPage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
      </ScreenScroll>
      <TabBar active="settings" onSelect={onTab} />
    </Screen>
  );
}

function SettingsTop({
  current,
  patternKeys,
  coworkerCount,
  profile,
  onOpen,
}: {
  current: RepeatRule | undefined;
  patternKeys: Shift[];
  coworkerCount: number;
  profile: Profile;
  onOpen: (page: Page) => void;
}) {
  return (
    <>
      <PageHeader title="設定" />
      <ListSection title="シフト">
        <ListRow
          label="働き方"
          onClick={() => {
            onOpen("work");
          }}
          // Which style, in short: the order itself is on the page.
          value={
            current
              ? `${current.sequence.length}日ごとの繰り返し`
              : "繰り返しなし"
          }
        />
        <ListRow
          label="シフトパターン"
          onClick={() => {
            onOpen("patterns");
          }}
          value={
            <>
              <span className={settingsParts.marks}>
                {patternKeys.map((key) => (
                  <ShiftMark key={key} shift={key} size={14} />
                ))}
              </span>
              {patternKeys.length}つ
            </>
          }
        />
        <ListRow
          label="一緒に働く人"
          onClick={() => {
            onOpen("coworkers");
          }}
          value={`${coworkerCount}人`}
        />
      </ListSection>
      <NotificationSection
        onChats={() => {
          onOpen("chatNotifications");
        }}
        onReminders={() => {
          onOpen("reminders");
        }}
      />
      <ListSection title="表示">
        <StyleRow
          onOpen={() => {
            onOpen("mark");
          }}
          patternKeys={patternKeys}
        />
        <AppearanceRow
          onOpen={() => {
            onOpen("appearance");
          }}
        />
        <AppIconRow
          onOpen={() => {
            onOpen("appIcon");
          }}
        />
        <WeekRow
          onOpen={() => {
            onOpen("week");
          }}
        />
      </ListSection>
      <ListSection title="アカウント">
        <ListRow
          label="プロフィール"
          onClick={() => {
            onOpen("profile");
          }}
          value={
            <span className={settingsParts.inlineValue}>
              <PhotoAvatar
                name={profile.name}
                photo={profile.photo}
                size={22}
              />
              {profile.name}
            </span>
          }
        />
        <AccountRow
          onOpen={() => {
            onOpen("account");
          }}
        />
      </ListSection>
      <SupportRow
        onOpen={() => {
          onOpen("support");
        }}
      />
      <AboutSection />
    </>
  );
}

// The apps open the site's pages in the system's browser sheet
// (SFSafariViewController, Custom Tabs); the prototype opens a tab.
function openOutside(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

// Pochical itself, at the foot of the settings, under the chat with the
// people who make it (SupportRow). Rows that leave the app end in ↗
// instead of the arrow of rows that go on inside it. The store's
// own review prompt comes by itself only now and then (spec/review.md);
// the review row is there whenever someone wants to write one, and opens
// the store's page for writing it (App Store's ?action=write-review,
// Google Play's listing), which the prototype has none of before release.
function AboutSection() {
  const platform = useDevice((state) => state.platform);
  const toast = useContext(ToastContext);
  const store = platform === "ios" ? "App Store" : "Google Play";
  const outside = (
    <ArrowUpRight aria-hidden="true" className={listRow.arrow} size={17} />
  );
  return (
    <div>
      <ListSection title={`${site.name}について`}>
        <ListRow
          arrow={outside}
          label="ヘルプ"
          onClick={() => {
            openOutside("/support");
          }}
        />
        <ListRow
          arrow={outside}
          label={`${store}でレビューを書く`}
          onClick={() => {
            toast("公開後はレビューを書く画面が開きます", "problem");
          }}
        />
        <ListRow
          arrow={outside}
          label="利用規約"
          onClick={() => {
            openOutside("/terms");
          }}
        />
        <ListRow
          arrow={outside}
          label="プライバシーポリシー"
          onClick={() => {
            openOutside("/privacy");
          }}
        />
      </ListSection>
      <p className={settingsParts.version}>
        {site.name} {APP_VERSION}
      </p>
    </div>
  );
}
