import descriptionSymbol from "@iconify-icons/material-symbols/description-outline-rounded";
import handshakeSymbol from "@iconify-icons/material-symbols/handshake-outline-rounded";
import helpSymbol from "@iconify-icons/material-symbols/help-outline-rounded";
import privacyTipSymbol from "@iconify-icons/material-symbols/privacy-tip-outline-rounded";
import rateReviewSymbol from "@iconify-icons/material-symbols/rate-review-outline-rounded";
import repeatSymbol from "@iconify-icons/material-symbols/repeat-outline-rounded";
import workSymbol from "@iconify-icons/material-symbols/work-outline-rounded";
import { useContext, useState } from "react";

import { site } from "../lib/brand";
import type { RepeatRule, Schedule } from "../lib/design-days";
import { APP_VERSION, useDevice } from "../lib/design-device";
import type { Profile } from "../lib/design-group-data";
import { patternsInUse } from "../lib/design-patterns";
import type { Pattern, Shift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { CoworkersPage, useCoworkerList } from "./design-coworkers";
import { PhotoAvatar } from "./design-group-parts";
import { PageHeader } from "./design-header";
import { ListRow } from "./design-list";
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
  RepeatPage,
  RepeatPeriodPage,
  StopRepeatPage,
} from "./design-settings-work";
import { SupportChatPage, SupportRow } from "./design-support-chat";
import { TabBar } from "./design-tab-bar";
import type { Tab } from "./design-tab-bar";
import { ToastContext } from "./design-toast";
import {
  Screen,
  ScreenScroll,
  SegmentedContext,
  SettingsLists,
} from "./design-ui";
import { useWeek } from "./design-week";
import { ShiftMark } from "./shift-mark";

export type SettingsPage = Page;

type Page =
  | "top"
  | "repeat-new"
  | "repeat-fix"
  | "repeat-period"
  | "job"
  | "repeat"
  | "stop-repeat"
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
  onPutRule,
  onRemoveRule,
  onChangeJob,
  onTab,
  initialPage = "top",
}: {
  patterns: Pattern[];
  rules: RepeatRule[];
  schedule: Schedule;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  // 繰り返し's periods: one put in or set again (`replacing` its old
  // start when moved), or taken out.
  onPutRule: (rule: RepeatRule, replacing?: Date) => void;
  onRemoveRule: (start: Date) => void;
  onChangeJob: (job: { patterns: Pattern[]; rule: RepeatRule }) => void;
  onTab: (tab: Tab) => void;
  // For the flow diagrams: a page to open on.
  initialPage?: Page;
}) {
  const coworkers = useCoworkerList();
  const platform = useDevice((state) => state.platform);
  const [page, setPage] = useState<Page>(initialPage);
  // A new job's order on the calendar takes the screen, its keys at the
  // foot, as typing an order does.
  const [jobOrdering, setJobOrdering] = useState(false);
  const weekTools = useWeek();
  const patternKeys = patternsInUse(patterns).map((pattern) => pattern.id);
  const preview = stylePreviewOf(patterns, weekTools.weekDates);
  // From the week holding the 21st, so all three holidays of the 21st to
  // 23rd fall in the fortnight whatever day the week starts on.
  const weekPreview = stylePreviewOf(
    patterns,
    weekTools.weekDates,
    holidayWeekDay
  );
  // The period in use today, while it repeats: 設定's 繰り返し row says
  // how often it comes round.
  const inUse = rules.findLast((rule) => rule.start <= designToday);
  const current = inUse?.sequence.length ? inUse : undefined;
  // The period opened from 繰り返し's list, by its start.
  const [periodStart, setPeriodStart] = useState<Date>();
  const period = rules.find(
    (rule) => rule.start.getTime() === periodStart?.getTime()
  );
  // The order to start from when repeating again.
  const lastSequence =
    [...rules].reverse().find((rule) => rule.sequence.length > 0)?.sequence ??
    [];
  // A chat fills the screen, its composer where the tab bar was, as the
  // group chats do.
  // Typing an order fills the screen, its keys at the foot, as ポチポチ入力.
  if (page === "repeat-new" || page === "repeat-fix") {
    return (
      <Screen>
        {page === "repeat-new" && (
          <RepeatEditorPage
            initialSequence={lastSequence}
            mode={rules.length > 0 ? "switch" : "first"}
            onApply={(rule) => {
              onPutRule(rule);
              setPage("repeat");
            }}
            onBack={() => {
              setPage("repeat");
            }}
            patternKeys={patternKeys}
            shown={schedule}
          />
        )}
        {page === "repeat-fix" && period && (
          <RepeatEditorPage
            current={period}
            initialSequence={period.sequence}
            mode="fix"
            onApply={(rule) => {
              onPutRule(rule);
              setPage("repeat-period");
            }}
            onBack={() => {
              setPage("repeat-period");
            }}
            patternKeys={patternKeys}
            shown={schedule}
          />
        )}
      </Screen>
    );
  }
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
      <SettingsLists>
        <ScreenScroll fill={page === "job" && jobOrdering}>
          {page === "top" && (
            <SettingsTop
              coworkerCount={coworkers.list.length}
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
          {page === "job" && (
            <JobChangePage
              onApply={(job) => {
                onChangeJob(job);
                setPage("patterns");
              }}
              onBack={() => {
                setPage("patterns");
              }}
              onOrdering={setJobOrdering}
            />
          )}
          {page === "repeat" && (
            <RepeatPage
              onBack={() => {
                setPage("top");
              }}
              onNew={() => {
                setPage("repeat-new");
              }}
              onOpen={(start) => {
                setPeriodStart(start);
                setPage("repeat-period");
              }}
              onStop={() => {
                setPage("stop-repeat");
              }}
              rules={rules}
            />
          )}
          {page === "repeat-period" && period && (
            <RepeatPeriodPage
              onBack={() => {
                setPage("repeat");
              }}
              onFix={() => {
                setPage("repeat-fix");
              }}
              onMove={(start) => {
                onPutRule(
                  { ...period, anchor: period.anchor ?? period.start, start },
                  period.start
                );
                setPeriodStart(start);
              }}
              onPut={(rule) => {
                onPutRule(rule);
              }}
              onRemove={() => {
                onRemoveRule(period.start);
                setPage("repeat");
              }}
              rule={period}
              rules={rules}
            />
          )}
          {page === "stop-repeat" && (
            <StopRepeatPage
              onApply={(start) => {
                onPutRule({ sequence: [], start });
                setPage("repeat");
              }}
              onBack={() => {
                setPage("repeat");
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
          {page === "appIcon" && platform === "ios" && (
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
              onJob={() => {
                setPage("job");
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
      </SettingsLists>
      {/* Each page is pushed over the tabs, as the group's are. */}
      {page === "top" && <TabBar active="settings" onSelect={onTab} />}
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
  const platform = useDevice((state) => state.platform);
  const segmented = useContext(SegmentedContext);
  const face = (
    <PhotoAvatar
      name={profile.name}
      photo={profile.photo}
      size={segmented ? 24 : 22}
    />
  );
  return (
    <>
      <PageHeader title="設定" />
      <ListSection title="シフト">
        <ListRow
          label="シフトパターン"
          onClick={() => {
            onOpen("patterns");
          }}
          symbol={workSymbol}
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
          label="繰り返し"
          onClick={() => {
            onOpen("repeat");
          }}
          symbol={repeatSymbol}
          // How long it runs, in short: the order itself is on the page.
          value={current ? `${current.sequence.length}日ごと` : "なし"}
        />
        <ListRow
          label="一緒に働く人"
          onClick={() => {
            onOpen("coworkers");
          }}
          symbol={handshakeSymbol}
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
        <WeekRow
          onOpen={() => {
            onOpen("week");
          }}
        />
        {/* Outside the app, and changed least, so last. iOS's alone: an
            Android launcher takes one icon, tinted by its themed icons. */}
        {platform === "ios" && (
          <AppIconRow
            onOpen={() => {
              onOpen("appIcon");
            }}
          />
        )}
      </ListSection>
      <ListSection title="アカウント">
        {/* iOS shows the face beside the name; Android leads the row
            with it, as its own Settings does the account's. */}
        <ListRow
          label="プロフィール"
          leading={segmented ? face : undefined}
          onClick={() => {
            onOpen("profile");
          }}
          value={
            segmented ? (
              profile.name
            ) : (
              <span className={settingsParts.inlineValue}>
                {face}
                {profile.name}
              </span>
            )
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
  return (
    <div>
      <ListSection title={`${site.name}について`}>
        <ListRow
          leaves
          label="ヘルプ"
          onClick={() => {
            openOutside("/support");
          }}
          symbol={helpSymbol}
        />
        <ListRow
          leaves
          label={`${store}でレビューを書く`}
          onClick={() => {
            toast("公開後はレビューを書く画面が開きます", "problem");
          }}
          symbol={rateReviewSymbol}
        />
        <ListRow
          leaves
          label="利用規約"
          onClick={() => {
            openOutside("/terms");
          }}
          symbol={descriptionSymbol}
        />
        <ListRow
          leaves
          label="プライバシーポリシー"
          onClick={() => {
            openOutside("/privacy");
          }}
          symbol={privacyTipSymbol}
        />
      </ListSection>
      <p className={settingsParts.version}>
        {site.name} {APP_VERSION}
      </p>
    </div>
  );
}
