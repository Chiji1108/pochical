import type { ColorScheme } from "@pochical/design/colors";
import { css } from "@pochical/styled-system/css";
import { Check } from "lucide-react";
import { useContext, useState } from "react";

import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { AppIcon, pickableIcons, useAppIcons } from "./design-app-icon";
import {
  Choice,
  ChoiceGrid,
  ChoiceTile,
  Segment,
  SegmentedControl,
} from "./design-choices";
import { PageHeader } from "./design-header";
import { List, ListRow, SwitchRow } from "./design-list";
import { shortMonthOf } from "./design-month-name";
import { settingsParts } from "./design-settings-parts";
import { StylePreview } from "./design-settings-preview";
import type { StylePreviewData } from "./design-settings-preview";
import { SystemAlert } from "./design-sheet";
import { ColorSchemeContext, presetOf, themeStyle } from "./design-theme";
import type { Appearance, PresetId } from "./design-theme";
import { Note, Section } from "./design-ui";
import { weekdayNameOf, weekdayNames } from "./design-week";
import type { ColoredDay } from "./design-week";

// The pages about how the app looks: 外観 (light or dark), the app's icon,
// and the calendar's week (月と曜日, where it starts, colored days).

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

// 外観 reads like the other rows: the current choice, opening a list.
export function AppIconRow({ onOpen }: { onOpen: () => void }) {
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
export function AppIconPage({ onBack }: { onBack: () => void }) {
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

export function AppearanceRow({ onOpen }: { onOpen: () => void }) {
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

const schemeOptions = [
  { name: "ライト", scheme: "light" },
  { name: "ダーク", scheme: "dark" },
] as const;

// The two choices on the list's first row, iOS's circle under each:
// empty, or the accent's with a check when picked.
const schemeChoices = {
  check: css({
    "& svg": { visibility: "hidden" },
    "[data-state=checked] > &": {
      "& svg": { visibility: "visible" },
      bg: "accent.default",
      borderColor: "accent.default",
    },
    alignItems: "center",
    border: "2px solid token(colors.text.quaternary)",
    borderRadius: "full",
    color: "background.base",
    display: "flex",
    height: "26px",
    justifyContent: "center",
    width: "26px",
  }),
  choice: css({
    alignItems: "center",
    borderRadius: "xl",
    color: "text.primary",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "8px",
    textStyle: "body",
  }),
  grid: css({
    display: "flex",
    padding: "20px 16px 16px",
  }),
};

// The テーマ's ground with a heading and a month on a card, some of its
// days in the accent, as /design's テーマ cards draw one small.
const schemeScreen = {
  card: css({
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "sm",
    display: "grid",
    gap: "2px",
    gridTemplateColumns: "repeat(5, 6px)",
    padding: "4px",
    width: "fit-content",
  }),
  day: css({
    "&[data-lit]": { bg: "accent.fill" },
    bg: "fill.tertiary",
    borderRadius: "2xs",
    height: "6px",
  }),
  heading: css({
    bg: "text.primary",
    borderRadius: "full",
    height: "4px",
    width: "24px",
  }),
  screen: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "lg",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "128px",
    padding: "12px 8px 0",
    width: "66px",
  }),
};

const MONTH_DAYS = 25;
// A few days scattered over the month, as shifts would be.
const LIT_EVERY = 4;

function SchemeScreen({
  preset,
  scheme,
}: {
  preset: PresetId;
  scheme: ColorScheme;
}) {
  return (
    <span
      aria-hidden="true"
      className={schemeScreen.screen}
      style={themeStyle(preset, scheme)}
    >
      <span className={schemeScreen.heading} />
      <span className={schemeScreen.card}>
        {Array.from({ length: MONTH_DAYS }, (_, day) => (
          <span
            className={schemeScreen.day}
            data-lit={day % LIT_EVERY === 1 ? "" : undefined}
            key={day}
          />
        ))}
      </span>
    </span>
  );
}

// As iOS's 画面表示と明るさ: ライト and ダーク side by side, each a small
// screen in the テーマ, and 端末に合わせる under them to follow the device.
// With it on, the one the screen is in now is checked; picking one turns it off,
// and turning it off keeps the one in use. The choice stays open under an
// always-dark テーマ, which says so, since it takes effect again once the
// テーマ changes.
export function AppearancePage({ onBack }: { onBack: () => void }) {
  const appearance = useSettings((state) => state.device.appearance);
  const setAppearance = useSettings((state) => state.setAppearance);
  const preset = useSettings((state) => state.device.preset);
  const alwaysDark = useAlwaysDarkTheme();
  const scheme = useContext(ColorSchemeContext);
  const shown = appearance === "system" ? scheme : appearance;
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="外観" />
      <List>
        <ChoiceGrid
          className={schemeChoices.grid}
          label="外観"
          onValueChange={setAppearance}
          value={shown}
        >
          {schemeOptions.map((option) => (
            <Choice
              className={schemeChoices.choice}
              key={option.scheme}
              value={option.scheme}
            >
              <SchemeScreen
                // An always-dark テーマ has no light to show: ポチカル's
                // stands in for ライト, and ダーク shows the テーマ itself.
                preset={
                  alwaysDark && option.scheme === "light" ? "pochical" : preset
                }
                scheme={option.scheme}
              />
              {option.name}
              <span aria-hidden="true" className={schemeChoices.check}>
                <Check size={16} strokeWidth={3} />
              </span>
            </Choice>
          ))}
        </ChoiceGrid>
        <SwitchRow
          checked={appearance === "system"}
          label="端末に合わせる"
          onChange={(checked) => {
            setAppearance(checked ? "system" : scheme);
          }}
        />
      </List>
      <Note>
        {alwaysDark
          ? `テーマの「${alwaysDark.name}」はいつもダークで表示されます。ほかのテーマにすると、ここでの設定に戻ります。`
          : "オンにすると、端末の設定に合わせてライトとダークが切り替わります。"}
      </Note>
    </>
  );
}

// The variables written out, not token.var(): styled-system/tokens would
// bring every token's table into what /try waits for, 8 KB gzipped.
const coloredDayOptions: { day: ColoredDay; name: string; color: string }[] = [
  {
    color: "var(--colors-calendar-saturday)",
    day: "saturday",
    name: "土曜",
  },
  { color: "var(--colors-calendar-holiday)", day: "sunday", name: "日曜" },
  { color: "var(--colors-calendar-holiday)", day: "holiday", name: "祝日" },
];

export function WeekRow({ onOpen }: { onOpen: () => void }) {
  const week = useSettings((state) => state.device.week);
  const monthName = useSettings((state) => state.device.monthName);
  // Set small in a row, the month reads as UI text does (Sep), not as
  // the calendar's heading draws it (sep.).
  const month = shortMonthOf(designToday, monthName === "english");
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
export function WeekPage({
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
          {/* Each choice as it reads in small UI text, 9月・木 or Sep・Thu;
              the preview above shows the heading's own sep. */}
          <Segment label="日本語" value="number">
            {shortMonthOf(designToday)}・{weekdayNameOf(designToday.getDay())}
          </Segment>
          <Segment label="英語" value="english">
            {shortMonthOf(designToday, true)}・
            {weekdayNameOf(designToday.getDay(), true)}
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
