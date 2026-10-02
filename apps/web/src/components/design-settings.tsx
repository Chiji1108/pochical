import type { ColorScheme } from "@pochical/design/colors";
import { presets } from "@pochical/design/themes";
import type { Preset } from "@pochical/design/themes";
import { ArrowRight, ArrowUpRight, CloudCheck } from "lucide-react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { css, cva } from "styled-system/css";
import { token } from "styled-system/tokens";

import {
  addDays,
  dateKey,
  defaultHolidaysOff,
  formatDay,
  isRepeating,
  holidayShiftOf,
  repeatSchedule,
} from "../lib/design-days";
import type { RepeatRule, Schedule } from "../lib/design-days";
import { APP_VERSION, useDevice } from "../lib/design-device";
import {
  isDayOff,
  OwnPatternsContext,
  presetList,
  presetPatterns,
  usePatterns,
} from "../lib/design-patterns";
import type { Pattern, PatternBook, Shift } from "../lib/design-patterns";
import { useLook, useSettings } from "../lib/design-settings-store";
import { useUser } from "../lib/design-user-store";
import { site } from "../lib/site";
import { dayName } from "../lib/text-limits";
import {
  ProviderButtons,
  ProviderLogo,
  providerNames,
  sampleEmails,
  signInMilliseconds,
} from "./design-account";
import type { AccountProvider } from "./design-account";
import { AppIcon, pickableIcons, useAppIcons } from "./design-app-icon";
import { CoworkersPage } from "./design-coworkers";
import type { Coworkers } from "./design-coworkers";
import { InputDatePicker } from "./design-date-picker";
import { DayCell } from "./design-day-cell";
import type { Profile } from "./design-group-data";
import { PhotoAvatar, PhotoEditor } from "./design-group-parts";
import { englishMonthOf, MonthName } from "./design-month-name";
import {
  ChatNotificationsPage,
  NotificationSection,
  RemindersPage,
} from "./design-notifications";
import { PatternsPage } from "./design-pattern-editor";
import { PresetContexts } from "./design-providers";
import { RepeatSequenceEditor, ShiftPreview } from "./design-repeat-editor";
import { ConfirmDialog, SystemAlert } from "./design-sheet";
import {
  SupportChatPage,
  supportLinesOf,
  SupportRow,
} from "./design-support-chat";
import type { SupportLine, SupportSample } from "./design-support-chat";
import { TabBar } from "./design-tab-bar";
import type { Tab } from "./design-tab-bar";
import {
  ColorSchemeContext,
  PreviewSchemeSwitch,
  ThemeContext,
  presetOf,
  themeStyle,
  previewWrap,
  deviceColorsPreset,
} from "./design-theme";
import type { Appearance, PresetId } from "./design-theme";
import { ToastContext } from "./design-toast";
import {
  Button,
  ChipGroup,
  ChoiceGrid,
  ChoiceTile,
  ChoiceList,
  ChoiceRow,
  dayGrid,
  fieldLabel,
  LimitedInput,
  List,
  ListRow,
  listRow,
  Note,
  PageDots,
  PageHeader,
  Pager,
  SampleTag,
  Screen,
  ScreenScroll,
  Section,
  Segment,
  SegmentedControl,
  srOnly,
  SwitchRow,
  Tag,
  WeekdayRow,
} from "./design-ui";
import { useWeek, weekdayNameOf, weekdayNames } from "./design-week";
import type { ColoredDay } from "./design-week";
import { WorkSetupSteps } from "./design-work-setup";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  ShiftMark,
  ShiftMarkStyleContext,
  useOffHighlight,
} from "./shift-mark";
import type { LookSettings, ShiftMarkStyle } from "./shift-mark";

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

// The four shapes members see. Icons come filled (塗り) or as outlines (線);
// letters always sit on their tile, and emoji have no fill.
const shapeOptions: { name: string; style: ShiftMarkStyle; fill: boolean }[] = [
  { fill: true, name: "塗り", style: "icon" },
  { fill: false, name: "線", style: "icon" },
  { fill: true, name: "絵文字", style: "emoji" },
  { fill: true, name: "文字", style: "badge" },
];

function shapeOf(look: LookSettings) {
  return (
    shapeOptions.find(
      (option) =>
        option.style === look.style &&
        (look.style !== "icon" || option.fill === look.fill)
    ) ?? shapeOptions[0]
  );
}

const previewDays = 14;
const previewToday = new Date(2026, 8, 24);
const WEEK_DAYS = 7;
const holidayWeekDay = new Date(2026, 8, 21);

// Shortens runs of the same shift, e.g. 日勤×2・夕勤×2. An order from
// before may name a pattern deleted since.
function sequenceLabel(sequence: Shift[], book: PatternBook) {
  const runs: { shift: Shift; count: number }[] = [];
  for (const shift of sequence) {
    const last = runs.at(-1);
    if (last?.shift === shift) {
      last.count += 1;
    } else {
      runs.push({ count: 1, shift });
    }
  }
  return runs
    .map(
      ({ shift, count }) =>
        `${book[shift]?.name ?? "削除したパターン"}${count > 1 ? `×${count}` : ""}`
    )
    .join("・");
}

function shortDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function DesignSettings({
  patterns,
  coworkers,
  rules,
  schedule,
  profile,
  onProfile,
  onApplyRule,
  onFixRule,
  onChangeJob,
  onHolidaysOff,
  onTab,
  supportSample = "none",
  initialPage = "top",
}: {
  patterns: Pattern[];
  coworkers: Coworkers;
  rules: RepeatRule[];
  schedule: Schedule;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onApplyRule: (rule: RepeatRule) => void;
  onFixRule: (rule: RepeatRule) => void;
  onChangeJob: (job: { patterns: Pattern[]; rule: RepeatRule }) => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
  onTab: (tab: Tab) => void;
  // What has been said with support so far.
  supportSample?: SupportSample;
  // For the flow diagrams: a page to open on.
  initialPage?: Page;
}) {
  const [page, setPage] = useState<Page>(initialPage);
  // Kept here, so leaving the chat and coming back finds it as it was.
  const [supportLines, setSupportLines] = useState(() =>
    supportLinesOf(supportSample)
  );
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
        lines={supportLines}
        onBack={() => {
          setPage("top");
        }}
        onChange={setSupportLines}
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
            supportLines={supportLines}
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
  supportLines,
  onOpen,
}: {
  current: RepeatRule | undefined;
  patternKeys: Shift[];
  coworkerCount: number;
  profile: Profile;
  supportLines: SupportLine[];
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
        lines={supportLines}
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

// The app icons, two across, the one in use outlined; iOS then says in
// its own alert that the icon changed. Two across shows four icons at a
// size where their grounds and the dark one's rim read; seasonal ones
// later may need three.
const appIcons = {
  grid: css({
    border: 0,
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(2, 1fr)",
    margin: "8px 0 20px",
    padding: 0,
  }),
};
// Between pages, wider than between cards, so a swipe shows where one ends.
const THEME_PAGE_GAP = 16;

// The テーマ cards, three to a page of a pager with dots under it, as
// Telegram's 外観 shows its themes: the preview stays in sight while
// trying them, where a grid of four rows pushed the rest of スタイル
// down, and the dots tell there are more to the side.
const themeCard = {
  // A card on the screen, as the テーマ's lists and sheets sit on it.
  card: css({
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "sm",
    display: "flex",
    gap: "2px",
    justifyContent: "center",
    padding: "8px 2px",
  }),
  // 端末の色 on Android, in a row of its own over the others: its card in
  // the first of the three columns, and what it is beside it.
  deviceNote: css({
    alignSelf: "center",
    color: "text.tertiary",
    gridColumn: "span 2",
    lineHeight: 1.5,
    margin: 0,
    textStyle: "footnote",
  }),
  deviceRow: css({
    borderBottom: "1px solid token(colors.separator)",
    display: "grid",
    gap: "8px",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    marginBottom: "12px",
    paddingBottom: "12px",
  }),
  // One page: three across, as the grid had them.
  page: css({
    display: "grid",
    gap: "8px",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  }),
  pager: css({ border: 0, margin: 0, minWidth: 0, padding: 0 }),
  // The theme's own screen, in the current light or dark.
  sample: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "lg",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px 8px 12px",
  }),
  // The テーマ's text and its fill side by side, so a colored ink, as
  // 喫茶's, shows beside its accent.
  strokes: css({
    "& span": { borderRadius: "full", height: "4px" },
    "& span:first-child": { bg: "text.primary", width: "20px" },
    "& span:last-child": { bg: "accent.fill", width: "28px" },
    display: "flex",
    gap: "4px",
    justifyContent: "center",
  }),
};

// 休みの見せ方 and シフト名 drawn as a day in small: its date, and the mark
// lit or not, with the name under it or not.
const offSample = cva({
  base: {
    "& small": { color: "text.secondary", fontSize: "9px", fontWeight: 600 },
    // The shift's name under the mark, smaller than the date.
    "& small[data-part=name]": {
      fontSize: "7px",
      lineClamp: 1,
      maxWidth: "100%",
      overflowWrap: "anywhere",
    },
    alignItems: "center",
    borderRadius: "sm",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    height: "40px",
    paddingTop: "4px",
    width: "32px",
  },
  variants: { lit: { true: { bg: "calendar.offTint" } } },
});

const settingsParts = {
  // A work style's emoji before its name, the size of a row's icon.
  styleIcon: css({
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", sans-serif',
    fontSize: "20px",
    lineHeight: 1,
  }),
  // A section's footer, as iOS sets explanation under a group of rows.
  footer: css({
    color: "text.tertiary",
    lineHeight: 1.5,
    margin: "8px 16px 0",
    textStyle: "footnote",
  }),
  // The app's version under the last list, as apps end their settings.
  version: css({
    color: "text.tertiary",
    margin: "16px 0 0",
    textAlign: "center",
    textStyle: "footnote",
  }),
  card: css({ bg: "fill.quaternary", borderRadius: "2xl", padding: "16px" }),
  cardCount: css({ color: "text.tertiary", fontWeight: 400 }),
  cardLabel: css({
    display: "flex",
    fontWeight: 600,
    justifyContent: "space-between",
    margin: "0 0 12px",
    textStyle: "footnote",
  }),
  cardMeta: css({
    color: "text.tertiary",
    margin: "12px 0 0",
    textStyle: "footnote",
  }),
  job: css({ display: "flex", flexDirection: "column", gap: "16px" }),
  marks: css({
    alignItems: "center",
    display: "inline-flex",
    gap: "4px",
    marginRight: "8px",
    verticalAlign: "middle",
  }),
  // The calendar as seen, on the screen's own ground, with 見本 on its
  // top edge. It may be drawn in the other of light and dark, so it sets
  // its own text color.
  preview: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "2xl",
    color: "text.primary",
    padding: "20px 8px 8px",
    pointerEvents: "none",
    position: "relative",
  }),
  previewHeading: css({ padding: "0 8px 8px" }),
  // The home screen's page of the preview: the wallpaper edge to edge,
  // the widget in the middle of it.
  // Where the home screen's page goes while its widgets load.
  homePreviewLoading: css({ borderRadius: "2xl", minHeight: "100%" }),
  // A form's row: what is set on the left, its value on the right.
  field: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  }),
  // A row's value with an icon before it, like the account's provider.
  inlineValue: css({
    alignItems: "center",
    display: "inline-flex",
    gap: "8px",
    justifyContent: "flex-end",
  }),
};

// A titled list of rows. A section whose content brings its own ground
// is a Section.
function ListSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Section title={title}>
      <List>{children}</List>
    </Section>
  );
}

function AccountRow({ onOpen }: { onOpen: () => void }) {
  const account = useSettings((state) => state.account);
  return (
    <ListRow
      label="アカウント"
      onClick={onOpen}
      value={
        account ? (
          <span className={settingsParts.inlineValue}>
            <ProviderLogo provider={account.provider} size={15} />
            {providerNames[account.provider]}
          </span>
        ) : (
          "ログインしていません"
        )
      }
    />
  );
}

// Before signing in, what it is for and the two ways in; after, who is
// signed in and the ways out. Signing in is optional, so the page never
// pushes it beyond saying what it keeps safe.
// Signed out, it says what signing in keeps and offers the two ways in;
// signed in, which account it is, and leaving or deleting it.
const accountPage = {
  delete: css({ marginTop: "12px" }),
  hero: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px 12px 24px",
    textAlign: "center",
  }),
  icon: css({
    bg: "accent.container",
    borderRadius: "circle",
    color: "accent.default",
    display: "grid",
    height: "56px",
    marginBottom: "8px",
    placeItems: "center",
    width: "56px",
  }),
  lead: css({
    color: "text.tertiary",
    lineHeight: 1.6,
    margin: 0,
    textStyle: "subheadline",
  }),
  logo: css({
    bg: "background.card",
    borderRadius: "circle",
    color: "text.primary",
    display: "grid",
    height: "30px",
    marginRight: "12px",
    placeItems: "center",
    width: "30px",
  }),
  title: css({
    color: "text.primary",
    fontWeight: 700,
    margin: 0,
    textStyle: "title3",
  }),
};

function AccountPage({ onBack }: { onBack: () => void }) {
  const account = useSettings((state) => state.account);
  const setAccount = useSettings((state) => state.setAccount);
  const [busy, setBusy] = useState<AccountProvider>();
  const [confirm, setConfirm] = useState<"signOut" | "delete">();
  const signIn = (provider: AccountProvider) => {
    if (busy) {
      return;
    }
    setBusy(provider);
    setTimeout(() => {
      setAccount({ email: sampleEmails[provider], provider });
      setBusy(undefined);
    }, signInMilliseconds);
  };
  if (!account) {
    return (
      <>
        <PageHeader back="設定" onBack={onBack} title="アカウント" />
        <div className={accountPage.hero}>
          <span aria-hidden="true" className={accountPage.icon}>
            <CloudCheck size={28} />
          </span>
          <h4 className={accountPage.title}>ログインして、データを守る</h4>
          <p className={accountPage.lead}>
            機種変更しても、スマホとタブレットでも、同じシフトとグループを使えます。
          </p>
        </div>
        <ProviderButtons busy={busy} onPick={signIn} />
        <Note>
          はじめてなら、この端末のデータがそのまま引き継がれます。すでにアカウントがあれば、そのデータを開きます。ログインしなくても、この端末ではそのまま使えます。
        </Note>
      </>
    );
  }
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="アカウント" />
      <Section title="ログイン中">
        <List>
          <ListRow
            label={providerNames[account.provider]}
            value={account.email}
            leading={
              <>
                <span className={accountPage.logo}>
                  <ProviderLogo provider={account.provider} size={18} />
                </span>
              </>
            }
          />
        </List>
        <Note>
          シフトとグループはこのアカウントに保存され、ほかの端末でも同じデータを使えます。
        </Note>
      </Section>
      <List>
        {/* Asks first, on the spot, so no arrow as for a page. */}
        <ListRow
          onClick={() => {
            setConfirm("signOut");
          }}
          label="ログアウト"
          danger
        />
      </List>
      <List className={accountPage.delete}>
        {/* Asks first, on the spot, so no arrow as for a page. */}
        <ListRow
          onClick={() => {
            setConfirm("delete");
          }}
          label="アカウントを削除"
          danger
        />
      </List>
      {confirm === "signOut" && (
        <ConfirmDialog
          action="ログアウト"
          message="この端末からデータが消えます。もう一度ログインすれば、同じデータを使えます。"
          onCancel={() => {
            setConfirm(undefined);
          }}
          onConfirm={() => {
            setConfirm(undefined);
            setAccount(undefined);
          }}
          title="ログアウトしますか？"
        />
      )}
      {confirm === "delete" && (
        <ConfirmDialog
          action="アカウントとすべてのデータを削除"
          message="シフト、グループ、チャットがすべて削除されます。元に戻せません。"
          onCancel={() => {
            setConfirm(undefined);
          }}
          onConfirm={() => {
            setConfirm(undefined);
            setAccount(undefined);
          }}
          title="アカウントを削除しますか？"
        />
      )}
    </>
  );
}

function SequenceChips({ sequence }: { sequence: Shift[] }) {
  const book = usePatterns();
  return (
    <ChipGroup as="ol">
      {sequence.map((shift, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a sequence repeats the same shift, so position is its identity.
        <Tag as="li" key={index} tone="raised">
          <ShiftMark shift={shift} size={13} />
          {book[shift]?.name}
        </Tag>
      ))}
    </ChipGroup>
  );
}

// The order in use and what can change about it, under the work style.
function RepeatDetails({
  current,
  onNew,
  onFix,
  onHolidaysOff,
}: {
  current: RepeatRule;
  onNew: () => void;
  onFix: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  return (
    <>
      <div className={settingsParts.card}>
        <p className={settingsParts.cardLabel}>
          今の繰り返し
          <span className={settingsParts.cardCount}>
            {current.sequence.length}日ごと
          </span>
        </p>
        <SequenceChips sequence={current.sequence} />
        <p className={settingsParts.cardMeta}>{formatDay(current.start)}から</p>
      </div>
      <List>
        <SwitchRow
          checked={current.holidaysOff ?? false}
          label="祝日は休みにする"
          onChange={onHolidaysOff}
        />
      </List>
      <Button variant="primary" onClick={onNew}>
        新しい繰り返しにする
      </Button>
      <Button variant="text" onClick={onFix}>
        今の繰り返しを直す
      </Button>
      <Note>
        異動などで順番が変わるときは、切り替える日を選んで新しい繰り返しにします。それより前のシフトは、そのまま残ります。
      </Note>
    </>
  );
}

function RuleHistory({ rules }: { rules: RepeatRule[] }) {
  const book = usePatterns();
  return (
    <>
      {rules.length > 1 && (
        <ListSection title="これまで">
          {rules
            .map((rule, index) => {
              const next = rules[index + 1];
              const period = next
                ? `${shortDay(rule.start)}〜${shortDay(addDays(next.start, -1))}`
                : `${shortDay(rule.start)}〜`;
              return (
                <ListRow
                  key={dateKey(rule.start)}
                  label={period}
                  value={
                    rule.sequence.length > 0
                      ? sequenceLabel(rule.sequence, book)
                      : "繰り返しなし"
                  }
                />
              );
            })
            .reverse()}
        </ListSection>
      )}
    </>
  );
}

type RepeatMode = "first" | "switch" | "fix";

const repeatModes: Record<
  RepeatMode,
  { title: string; back: string; dayLabel: string; action: string }
> = {
  first: {
    action: "から繰り返す",
    back: "働き方",
    dayLabel: "始める日",
    title: "繰り返しを設定",
  },
  fix: {
    action: "から入れ直す",
    back: "働き方",
    dayLabel: "並びの1日目",
    title: "今の繰り返しを直す",
  },
  switch: {
    action: "から切り替える",
    back: "働き方",
    dayLabel: "切り替える日",
    title: "新しい繰り返し",
  },
};

// Sets an order from a day. Fixing keeps the rule's start and moves only
// the day the order begins on, so no gap opens before it.
function RepeatEditorPage({
  mode,
  current,
  initialSequence,
  patternKeys,
  onBack,
  onApply,
}: {
  mode: RepeatMode;
  current?: RepeatRule;
  initialSequence: Shift[];
  patternKeys: Shift[];
  onBack: () => void;
  onApply: (rule: RepeatRule) => void;
}) {
  const book = usePatterns();
  const fixing = mode === "fix" && current !== undefined;
  const text = repeatModes[mode];
  const [sequence, setSequence] = useState(initialSequence);
  const [day, setDay] = useState(() =>
    fixing ? (current.anchor ?? current.start) : nextMonthStart()
  );
  const start = fixing ? current.start : day;
  // Follows the order until the person sets it.
  const [holidaysChoice, setHolidaysChoice] = useState(
    fixing ? current.holidaysOff : undefined
  );
  const holidaysOff = holidaysChoice ?? defaultHolidaysOff(sequence, day, book);
  const rule: RepeatRule = { anchor: day, holidaysOff, sequence, start };
  return (
    <>
      <PageHeader back={text.back} onBack={onBack} title={text.title} />
      <div className={settingsParts.field}>
        <span className={fieldLabel({ place: "row" })}>{text.dayLabel}</span>
        <InputDatePicker
          ariaLabel={`${text.dayLabel}：${formatDay(day)}。タップで変更`}
          look="field"
          date={day}
          onSelect={setDay}
          title={text.dayLabel}
        >
          <span>{formatDay(day)}</span>
        </InputDatePicker>
      </div>
      <RepeatSequenceEditor
        onChange={setSequence}
        patternKeys={patternKeys}
        sequence={sequence}
      />
      <Note>
        {fixing
          ? "並びの1つ目のシフトが入る日を選びます。"
          : `${text.dayLabel}が、並びの1日目になります。`}
      </Note>
      <List>
        <SwitchRow
          checked={holidaysOff}
          label="祝日は休みにする"
          onChange={setHolidaysChoice}
        />
      </List>
      {sequence.length > 0 && <RepeatPreview rule={rule} />}
      {fixing && (
        <Note>
          {formatDay(start)}
          からのシフトを入れ直します。その間に自分で直した日も、並びのとおりに戻ります。
        </Note>
      )}
      <Button
        variant="primary"
        disabled={sequence.length === 0}
        onClick={() => {
          onApply(rule);
        }}
      >
        {shortDay(start)}
        {text.action}
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </>
  );
}

// The first two weeks of a rule, from its start.
function RepeatPreview({ rule }: { rule: RepeatRule }) {
  const { sequence, start, holidaysOff } = rule;
  const patterns = useUser((state) => state.patterns);
  const planned = repeatSchedule(
    sequence,
    rule.anchor ?? start,
    start,
    addDays(start, previewDays - 1),
    holidaysOff ? holidayShiftOf(patterns) : undefined
  );
  return (
    <ShiftPreview
      days={Array.from({ length: previewDays }, (_, index) => {
        const date = addDays(start, index);
        return { date, shift: planned[dateKey(date)]?.shift };
      })}
      label="はじめの2週間"
    />
  );
}

// Changing jobs: the day it happens, then the same questions as onboarding.
// Shifts before that day stay; everything after follows the new job.
function JobChangePage({
  onBack,
  onApply,
}: {
  onBack: () => void;
  onApply: (job: { patterns: Pattern[]; rule: RepeatRule }) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div className={settingsParts.job}>
        <WorkSetupSteps
          finishLabel={`${shortDay(start)}から切り替える`}
          month={start}
          onExit={() => {
            setAsking(false);
          }}
          onFinish={({ patternKeys, sequence, anchor }) => {
            onApply({
              patterns: presetList(patternKeys),
              rule: {
                anchor,
                sequence: sequence ?? [],
                start,
              },
            });
          }}
        />
      </div>
    );
  }
  return (
    <>
      <PageHeader back="働き方" onBack={onBack} title="新しい仕事にする" />
      <Note>
        新しい仕事の働き方とシフトパターンを、はじめの設定と同じ質問で選び直します。
      </Note>
      <div className={settingsParts.field}>
        <span className={fieldLabel({ place: "row" })}>新しい仕事の初日</span>
        <InputDatePicker
          ariaLabel={`新しい仕事の初日：${formatDay(start)}。タップで変更`}
          look="field"
          date={start}
          onSelect={setStart}
          title="新しい仕事の初日"
        >
          <span>{formatDay(start)}</span>
        </InputDatePicker>
      </div>
      <Note>
        前の日までのシフトは、そのまま残ります。この日からのシフトは、新しい仕事に合わせて入れ直します。
      </Note>
      <Button
        variant="primary"
        onClick={() => {
          setAsking(true);
        }}
      >
        次へ
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </>
  );
}

// Your name and picture, shown to the people in your groups. The picture
// is shared by every group; each group can use its own name for you.
// Your usual name and picture. New groups start with them; each group can
// use its own instead.
function ProfilePage({
  profile,
  onChange,
  onBack,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onBack: () => void;
}) {
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="プロフィール" />
      <PhotoEditor
        name={profile.name}
        onRemove={
          profile.photo
            ? () => {
                onChange({ ...profile, photo: undefined });
              }
            : undefined
        }
        onUpload={(photo) => {
          onChange({ ...profile, photo });
        }}
        photo={profile.photo}
        size={88}
      />
      <List>
        <ListRow
          label="いつもの名前"
          control={
            <>
              <LimitedInput
                align="end"
                look="inline"
                kind="personName"
                onValueChange={(name) => {
                  onChange({ ...profile, name });
                }}
                placeholder="例：さくら"
                value={profile.name}
              />
            </>
          }
        />
      </List>
      <Note>
        グループを作るときや参加するときに、最初に入る名前と写真です。グループごとに違う名前や写真にしたいときは、各グループの設定で変えられます。
      </Note>
    </>
  );
}

function nextMonthStart() {
  return new Date(previewToday.getFullYear(), previewToday.getMonth() + 1, 1);
}

const workStyles = {
  repeating: { icon: "🔁", name: "決まった順番で回っている" },
  // Not 毎月、勤務表が配られる: rosters come every three months, or
  // whenever the manager posts them, and all of them are this.
  roster: { icon: "📋", name: "シフトがその都度決まる" },
};

// The work style in use, then the ways to change it, each saying whether
// the shift patterns stay: the other style keeps them, a new job asks for
// them again as onboarding does. Unlike onboarding's two answers side by
// side, the one in use is not a choice to press again: it is shown as it
// is.
function WorkStylePage({
  rules,
  onBack,
  onRepeat,
  onRoster,
  onJob,
  onNew,
  onFix,
  onHolidaysOff,
}: {
  rules: RepeatRule[];
  onBack: () => void;
  onRepeat: () => void;
  onRoster: () => void;
  onJob: () => void;
  onNew: () => void;
  onFix: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  const repeating = isRepeating(rules);
  const current = rules.at(-1);
  const now = repeating ? workStyles.repeating : workStyles.roster;
  const other = repeating ? workStyles.roster : workStyles.repeating;
  const icon = (emoji: string) => (
    <>
      <span aria-hidden="true" className={settingsParts.styleIcon}>
        {emoji}
      </span>
    </>
  );
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="働き方" />
      <ListSection title="今の働き方">
        <ListRow label={now.name} leading={icon(now.icon)} />
      </ListSection>
      {repeating && current && (
        <RepeatDetails
          current={current}
          onFix={onFix}
          onHolidaysOff={onHolidaysOff}
          onNew={onNew}
        />
      )}
      <ListSection title="働き方を変える">
        <ListRow
          detail="シフトパターンはそのまま"
          label={
            repeating
              ? "順番で入れるのをやめる"
              : "決まった順番で回すようにする"
          }
          leading={icon(other.icon)}
          onClick={repeating ? onRoster : onRepeat}
        />
        <ListRow
          detail="シフトパターンも選び直す"
          label="新しい仕事にする"
          leading={icon("💼")}
          onClick={onJob}
        />
      </ListSection>
      <RuleHistory rules={rules} />
    </>
  );
}

// Stopping the repeat from a chosen day. Earlier shifts stay as they are.
function RosterSwitchPage({
  onBack,
  onApply,
}: {
  onBack: () => void;
  onApply: (start: Date) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  return (
    <>
      <PageHeader back="働き方" onBack={onBack} title="順番をやめる" />
      <div className={settingsParts.field}>
        <span className={fieldLabel({ place: "row" })}>やめる日</span>
        <InputDatePicker
          ariaLabel={`やめる日：${formatDay(start)}。タップで変更`}
          look="field"
          date={start}
          onSelect={setStart}
          title="やめる日"
        >
          <span>{formatDay(start)}</span>
        </InputDatePicker>
      </div>
      <Note>
        この日からの繰り返しのシフトは消えて、空いた状態になります。前の日までのシフトは、そのまま残ります。
      </Note>
      <Button
        variant="primary"
        onClick={() => {
          onApply(start);
        }}
      >
        {shortDay(start)}から順番をやめる
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </>
  );
}

function MarkPage({
  preview,
  onBack,
}: {
  preview: StylePreviewData;
  onBack: () => void;
}) {
  const current = useContext(ShiftMarkStyleContext);
  // The preview and the テーマ cards show in the other of light and dark
  // together, from either one's ☀︎ / ☾, without touching 外観.
  const scheme = useContext(ColorSchemeContext);
  const [picked, setPicked] = useState<ColorScheme>();
  const shown = picked ?? scheme;
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="スタイル" />
      <StylePreview preview={preview} shared={{ onPick: setPicked, shown }} />
      {/* Every choice shows in the preview at once, so there is nothing to
          confirm or cancel. Only the shape reaches the group, so it alone
          says so, under it as iOS puts a section's footer. */}
      <Section title="シフトの見た目">
        <ShapeChoices />
        <p className={settingsParts.footer}>
          グループの人にも、この見た目で表示されます。
        </p>
      </Section>
      <Section
        title="テーマ"
        trailing={
          <PreviewSchemeSwitch
            onPick={setPicked}
            placement="inline"
            shown={shown}
          />
        }
      >
        <ThemeChoices scheme={shown} />
      </Section>
      {/* Emoji keep their own colors, so シフトの色 would change nothing;
          it comes back as it was with any other shape. */}
      {current !== "emoji" && (
        <Section title="シフトの色">
          <ShiftColorsChoices />
        </Section>
      )}
      <Section title="休みの見せ方">
        <OffLookChoices current={current} />
      </Section>
      <Section title="シフト名">
        <NamesChoices current={current} />
      </Section>
    </>
  );
}

type StylePreviewData = { dates: Date[]; schedule: Schedule };

// This week and next as a made-up fortnight from the person's own
// patterns, the same whatever they have entered, so a change of style
// shows in the same places every time. Just shifts and days off: marks
// for 早出, 残業 or a note would mean nothing to most people here, and
// are explained where they are made instead.
function stylePreviewOf(
  patterns: Pattern[],
  weekDates: (date: Date) => Date[],
  from: Date = previewToday
): StylePreviewData {
  const dates = [...weekDates(from), ...weekDates(addDays(from, 7))];
  return {
    dates,
    schedule: repeatSchedule(
      sampleSequence(patterns),
      dates[0],
      dates[0],
      dates.at(-1) ?? dates[0]
    ),
  };
}

// Each working pattern with what follows it, like 明け after 夜勤, and a day
// off after every second one.
function sampleSequence(patterns: readonly Pattern[]): Shift[] {
  const ids = new Set(patterns.map((pattern) => pattern.id));
  const followers = new Set(patterns.map((pattern) => pattern.nextDay));
  const off = holidayShiftOf(patterns) ?? presetPatterns.off.id;
  const working = patterns.filter(
    (pattern) => !(isDayOff(pattern) || followers.has(pattern.id))
  );
  const sequence: Shift[] = [];
  for (const [index, pattern] of working.entries()) {
    sequence.push(pattern.id);
    const next = pattern.nextDay;
    if (next && ids.has(next)) {
      sequence.push(next);
    }
    if (index % 2 === 1 || next) {
      sequence.push(off);
    }
  }
  return sequence.at(-1) === off ? sequence : [...sequence, off];
}

// How many shifts the テーマ and color samples show in a row.
const WEEK_SAMPLE = 4;

// The marks beside each choice on the style pages are the person's own,
// as is the preview over them: a choice shows how their calendar would
// look. A working pattern, a day off, and a few as they follow each other.
// Ready-made ones stand in only for what they have none of.
function useOwnSamples() {
  const patterns = useContext(OwnPatternsContext);
  const work =
    patterns.find((pattern) => !isDayOff(pattern)) ?? presetPatterns.day;
  const off =
    patterns.find((pattern) => isDayOff(pattern)) ?? presetPatterns.off;
  return {
    off: off.id,
    week: [...new Set(sampleSequence(patterns))].slice(0, WEEK_SAMPLE),
    work,
  };
}

// The preview can show the other of light and dark on its own, without
// touching 外観, so a style can be judged in both. A page that shows more
// in the same light or dark passes it in.
function StylePreview({
  preview,
  shared,
  heading = false,
}: {
  preview: StylePreviewData;
  shared?: { shown: ColorScheme; onPick: (scheme: ColorScheme) => void };
  // With the month's heading over one week of days, as the カレンダー
  // page shows its 月と曜日.
  heading?: boolean;
}) {
  const { dates, schedule } = preview;
  // Under the month's heading, drawn at the calendar's own size, one week
  // is enough to show the days' colors, and keeps the preview short.
  const shownDates = heading ? dates.slice(0, WEEK_DAYS) : dates;
  const scheme = useContext(ColorSchemeContext);
  const [picked, setPicked] = useState<ColorScheme>();
  const shown = shared?.shown ?? picked ?? scheme;
  const onPick = shared?.onPick ?? setPicked;
  const { theme } = useContext(ThemeContext);
  const alwaysDark = presetOf(theme).scheme === "dark";
  const [page, setPage] = useState(0);
  const progress = useMotionValue(0);
  // The calendar's height, which the widget's page takes too, so the
  // pager keeps one height and nothing under it moves as it turns. The
  // pager draws the calendar anew as it moves between its slots, so it
  // is measured by a callback that follows the element drawn, and a
  // calendar taken away (measured as nothing) leaves the height alone.
  const [calendarHeight, setCalendarHeight] = useState<number>();
  const calendarObserver = useRef<ResizeObserver>(undefined);
  const calendarRef = useCallback((element: HTMLDivElement | null) => {
    calendarObserver.current?.disconnect();
    if (!element) {
      return;
    }
    const measure = () => {
      if (element.offsetHeight > 0) {
        setCalendarHeight(element.offsetHeight);
      }
    };
    measure();
    calendarObserver.current = new ResizeObserver(measure);
    calendarObserver.current.observe(element);
  }, []);
  const calendar = (
    <div
      aria-hidden="true"
      className={settingsParts.preview}
      inert
      ref={calendarRef}
      style={themeStyle(theme, shown)}
    >
      {heading && (
        <div className={settingsParts.previewHeading}>
          <MonthName month={dates[0] ?? previewToday} />
        </div>
      )}
      <WeekdayRow compact />
      <div className={dayGrid}>
        {shownDates.map((date) => (
          <DayCell
            active={false}
            date={date}
            editing={false}
            entry={schedule[dateKey(date)]}
            key={dateKey(date)}
            onPress={() => undefined}
            outside={false}
          />
        ))}
      </div>
    </div>
  );
  // The calendar, and swiped aside, the home screen's two weeks: what a
  // style or the week's settings change in the widgets too.
  const pages = [
    calendar,
    <Suspense
      fallback={
        <div
          className={settingsParts.homePreviewLoading}
          style={{ height: calendarHeight }}
        />
      }
      key="home"
    >
      <HomePreview
        height={calendarHeight}
        schedule={preview.schedule}
        today={previewToday}
      />
    </Suspense>,
  ];
  return (
    <div className={previewWrap}>
      <ColorSchemeContext value={shown}>
        <Pager
          ends={{ back: page > 0, forward: page < pages.length - 1 }}
          gap={PREVIEW_PAGE_GAP}
          onStep={(direction) => {
            setPage((at) => at + direction);
          }}
          page={String(page)}
          progress={progress}
          renderPage={(offset) => pages[page + offset] ?? null}
        />
      </ColorSchemeContext>
      {/* Which page is shown, on the preview's edge, kept still like the
          switch beside it while the pages move. */}
      <SampleTag
        label={
          <PageNames names={previewPageNames} page={page} progress={progress} />
        }
      />
      {/* An always-dark テーマ has no light to switch to: its ☾ stays on. */}
      <PreviewSchemeSwitch
        disabled={alwaysDark}
        onPick={onPick}
        shown={alwaysDark ? "dark" : shown}
      />
      <PageDots
        count={pages.length}
        current={page}
        label="プレビュー（カレンダー、ホーム画面）"
        onPick={setPage}
        progress={progress}
      />
    </div>
  );
}

const PREVIEW_PAGE_GAP = 12;
const previewPageNames = ["カレンダー", "ウィジェット"];

const pageNames = {
  // Each name over the same room, in its middle; an unseen copy of the
  // longest gives the tag its width. Not a grid of overlapping names,
  // which Safari drew empty.
  name: css({ inset: 0, position: "absolute", textAlign: "center" }),
  sizer: css({ visibility: "hidden" }),
  // The names slide within the tag, cut at its edges, never over each
  // other.
  stack: css({
    display: "inline-block",
    overflow: "hidden",
    position: "relative",
    verticalAlign: "top",
  }),
};

// The shown page's name, sliding out as the next slides in, as far as
// the pages are swiped and the same way, as the dots under them follow
// the finger.
function PageNames({
  names,
  page,
  progress,
}: {
  names: string[];
  page: number;
  progress: MotionValue<number>;
}) {
  // Where the names are, in pages, kept as PageDots keeps its bar: the
  // page shown plus the swipe, and only the page once it has landed,
  // whichever of the two news comes first.
  const position = useMotionValue(page);
  const base = useRef(page);
  useMotionValueEvent(progress, "change", (share) => {
    position.set(base.current + share);
  });
  useLayoutEffect(() => {
    base.current = page;
    position.set(page);
  }, [page, position]);
  const longest = names.toSorted((a, b) => b.length - a.length)[0] ?? "";
  return (
    <span className={pageNames.stack}>
      <span className={pageNames.sizer}>{longest}</span>
      {names.map((name, index) => (
        <PageName index={index} key={name} name={name} position={position} />
      ))}
    </span>
  );
}

function PageName({
  name,
  index,
  position,
}: {
  name: string;
  index: number;
  position: MotionValue<number>;
}) {
  const x = useTransform(position, (at) => `${(index - at) * 100}%`);
  const opacity = useTransform(position, (at) =>
    Math.max(0, 1 - Math.abs(at - index))
  );
  return (
    <motion.span className={pageNames.name} style={{ opacity, x }}>
      {name}
    </motion.span>
  );
}

// The widgets come only with the preview, not with the app's first load.
const HomePreview = lazy(async () => {
  const module = await import("./design-home-preview");
  return { default: module.HomePreview };
});

// The switches for the look in use, as one list.
function ShapeChoices() {
  const { work } = useOwnSamples();
  const look = useLook();
  const setShape = useSettings((state) => state.setShape);
  const current = shapeOf(look);
  return (
    <SegmentedControl
      label="シフトの見た目"
      onValueChange={(name) => {
        const option = shapeOptions.find((item) => item.name === name);
        if (!option) {
          return;
        }
        // Only icons carry their fill; for the others it is left alone.
        setShape(
          option.style === "icon"
            ? { fill: option.fill, style: option.style }
            : { style: option.style }
        );
      }}
      value={current?.name ?? ""}
    >
      {shapeOptions.map((option) => (
        <Segment key={option.name} value={option.name}>
          <ShiftMarkStyleContext value={option.style}>
            <IconWeightContext value={option.fill ? "duotone" : "regular"}>
              <ShiftMark shift={work.id} size={20} />
            </IconWeightContext>
          </ShiftMarkStyleContext>
          {option.name}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

// How your own calendar shows the marks. Group screens decide these for
// themselves, so members never see them.
const offLooks = [
  { blankOff: false, highlight: true, id: "highlight", name: "強調" },
  { blankOff: false, highlight: false, id: "mark", name: "印だけ" },
  { blankOff: true, highlight: false, id: "blank", name: "空白" },
] as const;

// How days off show, as the two settings that carry it.
export type OffLook = { highlight: boolean; blankOff: boolean };

function offLookId(value: OffLook) {
  if (value.blankOff) {
    return "blank";
  }
  return value.highlight ? "highlight" : "mark";
}

// Segments each drawing a day off as it would look. 空白 leaves
// days off empty on the month; they come back faint while entering and in
// the week view. Used by the style page and by the saved image, each with
// its own values.
export function OffLookTabs({
  value,
  onChange,
}: {
  value: OffLook;
  onChange: (value: OffLook) => void;
}) {
  const { off } = useOwnSamples();
  const picked = offLookId(value);
  return (
    <SegmentedControl
      label="休みの見せ方"
      onValueChange={(id) => {
        const option = offLooks.find((item) => item.id === id);
        if (option) {
          onChange({ blankOff: option.blankOff, highlight: option.highlight });
        }
      }}
      size="tall"
      value={picked}
    >
      {offLooks.map((option) => (
        <Segment key={option.id} value={option.id}>
          <span
            aria-hidden="true"
            className={offSample({ lit: option.highlight })}
          >
            <small>5</small>
            {option.blankOff ? null : <ShiftMark shift={off} size={18} />}
          </span>
          {option.name}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

// Tabs like 休みの見せ方's, each drawing a working day with or without its
// name under the mark.
export function NameTabs({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { work } = useOwnSamples();
  return (
    <SegmentedControl
      label="シフト名"
      onValueChange={(picked) => {
        onChange(picked === "true");
      }}
      size="tall"
      value={String(value)}
    >
      {[false, true].map((withName) => (
        <Segment key={String(withName)} value={String(withName)}>
          <span aria-hidden="true" className={offSample()}>
            <small>5</small>
            <ShiftMark shift={work.id} size={withName ? 16 : 18} />
            {withName && <small data-part="name">{dayName(work.name)}</small>}
          </span>
          {withName ? "あり" : "なし"}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

function OffLookChoices({ current }: { current: ShiftMarkStyle }) {
  const look = useLook();
  const setCalendarOptions = useSettings((state) => state.setCalendarOptions);
  const highlight = useOffHighlight(current);
  return (
    <OffLookTabs
      onChange={setCalendarOptions}
      value={{ blankOff: look.blankOff, highlight }}
    />
  );
}

function NamesChoices({ current }: { current: ShiftMarkStyle }) {
  const { names } = useContext(CellNamesContext);
  const setCalendarOptions = useSettings((state) => state.setCalendarOptions);
  return (
    <NameTabs
      onChange={(withName) => {
        setCalendarOptions({ names: withName });
      }}
      value={names[current]}
    />
  );
}

const appearanceOptions: { appearance: Appearance; name: string }[] = [
  { appearance: "system", name: "端末に合わせる" },
  { appearance: "light", name: "ライト" },
  { appearance: "dark", name: "ダーク" },
];

function appearanceName(appearance: Appearance) {
  return (
    appearanceOptions.find((option) => option.appearance === appearance)
      ?.name ?? appearance
  );
}

// Like アプリアイコン's row, a look is shown rather than named: one of
// your own marks in the shape and テーマ in use, then the テーマ's name.
// Only the mark tells the shape, so it is spelled out for screen readers.
function StyleRow({
  patternKeys,
  onOpen,
}: {
  patternKeys: Shift[];
  onOpen: () => void;
}) {
  const look = useLook();
  const book = usePatterns();
  const preset = presetOf(useSettings((state) => state.device.preset));
  const shift =
    patternKeys.find((key) => !isDayOff(book[key])) ?? presetPatterns.day.id;
  return (
    <ListRow
      label="スタイル"
      onClick={onOpen}
      value={
        <span className={settingsParts.inlineValue}>
          <ShiftMark shift={shift} size={20} />
          <span className={srOnly}>{shapeOf(look).name}・</span>
          {preset.name}
        </span>
      }
    />
  );
}

// 外観 reads like the other rows: the current choice, opening a list.
function AppIconRow({ onOpen }: { onOpen: () => void }) {
  const icon = useSettings((state) => state.device.appIcon);
  const icons = useAppIcons();
  const picked = pickableIcons.find((option) => option.id === icon);
  return (
    <ListRow
      label="アプリアイコン"
      onClick={onOpen}
      value={
        <span className={settingsParts.inlineValue}>
          <AppIcon size={22} src={icons[icon]} />
          {picked?.name}
        </span>
      }
    />
  );
}

// The home screen icon. iOS confirms every change itself, so the page
// shows its alert; on a dark home screen each icon turns to the dark one.
function AppIconPage({ onBack }: { onBack: () => void }) {
  const icon = useSettings((state) => state.device.appIcon);
  const setIcon = useSettings((state) => state.setAppIcon);
  const icons = useAppIcons();
  const [alerted, setAlerted] = useState(false);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="アプリアイコン" />
      <ChoiceGrid
        className={appIcons.grid}
        label="アプリアイコン"
        onValueChange={(id) => {
          setIcon(id);
          setAlerted(true);
        }}
        value={icon}
      >
        {pickableIcons.map((option) => (
          <ChoiceTile key={option.id} size="large" value={option.id}>
            <AppIcon size={104} src={icons[option.id]} />
            {option.name}
          </ChoiceTile>
        ))}
      </ChoiceGrid>
      {alerted && (
        <SystemAlert
          onClose={() => {
            setAlerted(false);
          }}
          title="“ポチカル”のアイコンを変更しました"
        />
      )}
    </>
  );
}

// The テーマ in use when it is always dark, which 外観 then gives way to.
function useAlwaysDarkTheme() {
  const preset = presetOf(useSettings((state) => state.device.preset));
  return preset.scheme === undefined ? undefined : preset;
}

function AppearanceRow({ onOpen }: { onOpen: () => void }) {
  const appearance = useSettings((state) => state.device.appearance);
  const alwaysDark = useAlwaysDarkTheme();
  return (
    <ListRow
      label="外観"
      onClick={onOpen}
      value={
        alwaysDark ? `ダーク（${alwaysDark.name}）` : appearanceName(appearance)
      }
    />
  );
}

// Follow the device by default, or keep light or dark. The choice stays
// open under an always-dark テーマ, which says so, since it takes effect
// again once the テーマ changes.
function AppearancePage({ onBack }: { onBack: () => void }) {
  const appearance = useSettings((state) => state.device.appearance);
  const setAppearance = useSettings((state) => state.setAppearance);
  const alwaysDark = useAlwaysDarkTheme();
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="外観" />
      <ChoiceList label="外観" onValueChange={setAppearance} value={appearance}>
        {appearanceOptions.map((option) => (
          <ChoiceRow
            key={option.appearance}
            label={option.name}
            value={option.appearance}
          />
        ))}
      </ChoiceList>
      <Note>
        {alwaysDark
          ? `テーマの「${alwaysDark.name}」はいつもダークで表示されます。ほかのテーマにすると、ここでの設定に戻ります。`
          : "端末に合わせると、スマホの設定に合わせてライトとダークが切り替わります。"}
      </Note>
    </>
  );
}

const coloredDayOptions: { day: ColoredDay; name: string; color: string }[] = [
  {
    color: token.var("colors.calendar.saturday"),
    day: "saturday",
    name: "土曜",
  },
  { color: token.var("colors.calendar.holiday"), day: "sunday", name: "日曜" },
  { color: token.var("colors.calendar.holiday"), day: "holiday", name: "祝日" },
];

function WeekRow({ onOpen }: { onOpen: () => void }) {
  const week = useSettings((state) => state.device.week);
  const monthName = useSettings((state) => state.device.monthName);
  const month =
    monthName === "english"
      ? englishMonthOf(previewToday)
      : `${previewToday.getMonth() + 1}月`;
  return (
    <ListRow
      label="カレンダー"
      onClick={onOpen}
      value={`${weekdayNames[week.weekStart]}曜はじまり・${month}`}
    />
  );
}

// The calendar's frame: 月と曜日, what a tap on the month name does,
// 週の始まり and 色をつける日, seen on
// the style page's preview with the month's heading over it, in the order
// they come down it. Only the viewer's screen changes.
function WeekPage({
  preview,
  onBack,
}: {
  preview: StylePreviewData;
  onBack: () => void;
}) {
  const week = useSettings((state) => state.device.week);
  const setWeek = useSettings((state) => state.setWeek);
  const monthName = useSettings((state) => state.device.monthName);
  const setMonthName = useSettings((state) => state.setMonthName);
  const monthTap = useSettings((state) => state.device.monthTap);
  const setMonthTap = useSettings((state) => state.setMonthTap);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="カレンダー" />
      {/* The style page's preview cut to this week under the month's
          heading: whatever day the week starts on, it has a Saturday and a
          Sunday, and for most starts 秋分's holidays too. */}
      <StylePreview heading preview={preview} />
      {/* The month's name and the weekdays' together: a heading reads in
          one language, so English names both. */}
      <Section title="月と曜日">
        <SegmentedControl
          label="月と曜日"
          onValueChange={(value) => {
            setMonthName(value === "english" ? "english" : "number");
          }}
          value={monthName}
        >
          <Segment label="日本語" value="number">
            {previewToday.getMonth() + 1}月・
            {weekdayNameOf(previewToday.getDay())}
          </Segment>
          <Segment label="英語" value="english">
            {englishMonthOf(previewToday)}・
            {weekdayNameOf(previewToday.getDay(), true)}
          </Segment>
        </SegmentedControl>
      </Section>
      <Section title="月名をタップしたとき">
        <SegmentedControl
          label="月名をタップしたとき"
          onValueChange={(value) => {
            setMonthTap(value === "surprise" ? "surprise" : "pick");
          }}
          value={monthTap}
        >
          <Segment label="月を選ぶ" value="pick">
            月を選ぶ
          </Segment>
          <Segment label="おたのしみ" value="surprise">
            おたのしみ
          </Segment>
        </SegmentedControl>
      </Section>
      <Section title="週の始まり">
        <SegmentedControl
          label="週の始まり"
          onValueChange={(day) => {
            setWeek({ ...week, weekStart: Number(day) });
          }}
          size="compact"
          value={String(week.weekStart)}
        >
          {weekdayNames.map((name, day) => (
            <Segment key={name} label={`${name}曜`} value={String(day)}>
              {name}
            </Segment>
          ))}
        </SegmentedControl>
      </Section>
      <Section title="色をつける日">
        <List>
          {coloredDayOptions.map((option) => (
            <SwitchRow
              checked={week.colored[option.day]}
              key={option.day}
              label={option.name}
              onChange={(checked) => {
                setWeek({
                  ...week,
                  colored: { ...week.colored, [option.day]: checked },
                });
              }}
              swatch={option.color}
            />
          ))}
        </List>
      </Section>
      <Note>
        土曜と日曜は曜日の見出しに、祝日は日付に色がつきます。祝日は日曜と同じ赤です。グループの画面やウィジェットでも、この並びと色で表示されます。
      </Note>
    </>
  );
}

// シフトの色: each shift in its own color, or every shift in the テーマ's
// one. It carries meaning, telling shifts apart at a glance, so it is a
// choice of its own rather than part of a テーマ. Tabs like 休みの見せ方's
// rather than a switch, so each side shows its look in the テーマ in use:
// ワントーン under 墨 is the shifts in ink, which a switch's words could not
// show. The テーマ cards follow it too.
const shiftColorOptions = [
  { colored: true, name: "色分け" },
  { colored: false, name: "ワントーン" },
] as const;
const shiftColorSample = css({
  alignItems: "center",
  display: "flex",
  gap: "4px",
  height: "40px",
});
function ShiftColorsChoices() {
  const { week } = useOwnSamples();
  const shiftColors = useSettings((state) => state.device.shiftColors);
  const setShiftColors = useSettings((state) => state.setShiftColors);
  return (
    <SegmentedControl
      label="シフトの色"
      onValueChange={(picked) => {
        setShiftColors(picked === "true");
      }}
      size="tall"
      value={String(shiftColors)}
    >
      {shiftColorOptions.map((option) => (
        <Segment key={option.name} value={String(option.colored)}>
          <span aria-hidden="true" className={shiftColorSample}>
            <MonochromeContext value={{ monochrome: !option.colored }}>
              {week.map((shift) => (
                <ShiftMark key={shift} shift={shift} size={18} />
              ))}
            </MonochromeContext>
          </span>
          {option.name}
        </Segment>
      ))}
    </SegmentedControl>
  );
}

type ThemeOption = Preset & { id: PresetId };

// The テーマ in rows of three, each row a page: the basics, the soft ones,
// the colors, the nights.
const themePages: ThemeOption[][] = Array.from(
  { length: Math.ceil(presets.length / 3) },
  (_, page) => presets.slice(page * 3, page * 3 + 3)
);

// Each テーマ as a small screen: its ground, a card on it with shifts in
// its colors, and strokes of its text and its fill, so where each テーマ
// puts color tells apart at a glance. The one in use sits on a gray card,
// as app icons do.
function ThemeChoices({ scheme }: { scheme: ColorScheme }) {
  const current = useSettings((state) => state.device.preset);
  const setPreset = useSettings((state) => state.setPreset);
  // On Android, 端末の色 sits in a row of its own over the pages, as
  // Android's own color settings keep the colors it takes from the
  // wallpaper apart from the basic ones.
  const { platform, wallpaperHue } = useDevice();
  const deviceColors =
    platform === "android" ? deviceColorsPreset(wallpaperHue) : undefined;
  // Opens on the page of the テーマ in use.
  const [page, setPage] = useState(() =>
    Math.max(
      themePages.findIndex((themes) =>
        themes.some((preset) => preset.id === current)
      ),
      0
    )
  );
  const progress = useMotionValue(0);
  return (
    <>
      <ChoiceGrid
        className={themeCard.pager}
        label="テーマ"
        onValueChange={setPreset}
        value={current}
      >
        {deviceColors && (
          <div className={themeCard.deviceRow}>
            <ThemeChoice preset={deviceColors} scheme={scheme} />
            <p className={themeCard.deviceNote}>
              Android で設定されている色に合わせます。
            </p>
          </div>
        )}
        <Pager
          ends={{ back: page > 0, forward: page < themePages.length - 1 }}
          gap={THEME_PAGE_GAP}
          onStep={(direction) => {
            setPage((shown) => shown + direction);
          }}
          page={String(page)}
          progress={progress}
          renderPage={(offset) => {
            const themes = themePages[page + offset];
            return (
              themes && (
                <div className={themeCard.page}>
                  {themes.map((preset) => (
                    <ThemeChoice
                      key={preset.id}
                      preset={preset}
                      scheme={scheme}
                    />
                  ))}
                </div>
              )
            );
          }}
        />
      </ChoiceGrid>
      <PageDots
        count={themePages.length}
        current={page}
        label="テーマのページ"
        onPick={setPage}
        progress={progress}
      />
    </>
  );
}

function ThemeChoice({
  preset,
  scheme,
}: {
  preset: ThemeOption;
  scheme: ColorScheme;
}) {
  const { week } = useOwnSamples();
  return (
    <ChoiceTile size="small" value={preset.id}>
      <span
        aria-hidden="true"
        className={themeCard.sample}
        style={themeStyle(preset.id, scheme)}
      >
        <ColorSchemeContext value={scheme}>
          <PresetContexts id={preset.id}>
            <span className={themeCard.card}>
              {week.map((shift) => (
                <ShiftMark key={shift} shift={shift} size={14} />
              ))}
            </span>
          </PresetContexts>
        </ColorSchemeContext>
        <span className={themeCard.strokes}>
          <span />
          <span />
        </span>
      </span>
      {preset.name}
    </ChoiceTile>
  );
}
