import { useState } from "react";
import { css } from "styled-system/css";
import { token } from "styled-system/tokens";

import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { AppIcon, pickableIcons, useAppIcons } from "./design-app-icon";
import {
  ChoiceGrid,
  ChoiceList,
  ChoiceRow,
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
import { presetOf } from "./design-theme";
import type { Appearance } from "./design-theme";
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

// Follow the device by default, or keep light or dark. The choice stays
// open under an always-dark テーマ, which says so, since it takes effect
// again once the テーマ changes.
export function AppearancePage({ onBack }: { onBack: () => void }) {
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
