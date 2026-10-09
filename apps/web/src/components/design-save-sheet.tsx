import {
  CalendarPlus,
  Check,
  Download,
  Image as ImageIcon,
  Share,
} from "lucide-react";
import { useContext, useState } from "react";
import { css, cva, cx } from "styled-system/css";

import { dateKey, formatMonth } from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import type { ImageOptions } from "../lib/design-settings-store";
import { AppIcon } from "./design-app-icon";
import { DayCell } from "./design-day-cell";
import { dayGrid, WeekdayRow } from "./design-day-grid";
import { PageHeader } from "./design-header";
import { List, ListRow, SwitchRow } from "./design-list";
import { monthWithYearOf } from "./design-month-name";
import { NameTabs, OffLookTabs } from "./design-settings-style";
import { Sheet, SheetHeading, sheetBody, sheetLead } from "./design-sheet";
import {
  ColorSchemeContext,
  PreviewSchemeSwitch,
  presetOf,
  ThemeContext,
  themeStyle,
  previewWrap,
} from "./design-theme";
import { ToastContext } from "./design-toast";
import { Button, Note, Screen, ScreenScroll, Section } from "./design-ui";
import { useWeek } from "./design-week";
import {
  CellNamesContext,
  OffDisplayContext,
  OffHighlightContext,
} from "./shift-mark";

// The calendars on the device that take new events, as the system lists
// them: by account, under the name the account has there (iOS calls a
// Google account "Gmail"; Android names it by its address). Read-only ones,
// like holidays and birthdays, are left out. A Google account's own
// calendar is named by its address.
const deviceCalendars = [
  { color: "#5b8def", id: "icloud-home", name: "ホーム", source: "iCloud" },
  { color: "#e0894a", id: "icloud-work", name: "仕事", source: "iCloud" },
  { color: "#c46fd6", id: "icloud-family", name: "家族", source: "iCloud" },
  {
    color: "#4f9d69",
    id: "google",
    name: "sakura.sato@gmail.com",
    source: "Gmail",
  },
  { color: "#d9534f", id: "google-job", name: "バイト", source: "Gmail" },
  { color: "#8a8f98", id: "google-gym", name: "ジム", source: "Gmail" },
];
// The one the system adds new events to, picked before anything else.
const DEFAULT_CALENDAR_ID = "icloud-home";

// The calendars under their accounts, in the system's order.
const calendarSources = Object.entries(
  Object.groupBy(deviceCalendars, (item) => item.source)
);

type Step = "choose" | "calendar" | "pick" | { done: string };

const save = {
  // 画像で保存 over 端末カレンダーに追加.
  actions: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  add: css({ marginTop: "20px" }),
  // The picked calendar's check; the others keep its room, so the rows
  // line up.
  check: cva({
    base: { color: "accent.default", flexShrink: 0 },
    variants: { picked: { false: { visibility: "hidden" } } },
  }),
  done: css({ alignItems: "flex-start", display: "flex", gap: "8px" }),
  doneIcon: css({ color: "accent.default", flexShrink: 0, marginTop: "4px" }),
  // A calendar's own color, as the system lists them.
  dot: css({
    borderRadius: "circle",
    flexShrink: 0,
    height: "10px",
    width: "10px",
  }),
  picker: css({ display: "flex", flexDirection: "column", gap: "24px" }),
  // The dot before the picked calendar's name, in the row's value.
  valueDot: css({
    borderRadius: "circle",
    display: "inline-block",
    height: "10px",
    marginRight: "8px",
    verticalAlign: "1px",
    width: "10px",
  }),
};

// The icon the store shows, in light and dark alike, whichever one this
// device picked: the one someone who gets the picture will look for.
const STORE_ICON = "/app/pwa-192x192.png";

// The picture as it will be saved: the month in the calendar screen's own
// ground, so it is the calendar as seen (the raised ground would lift it
// in dark mode), and 共有 and 保存 under the page.
const picture = {
  actions: css({
    display: "grid",
    flexShrink: 0,
    gap: "12px",
    gridTemplateColumns: "1fr 1fr",
    padding: "12px 4px 20px",
  }),
  // The app's name with its icon, so someone who gets the picture can
  // find the app in the store by the same dog.
  credit: css({
    alignItems: "center",
    color: "text.quaternary",
    display: "flex",
    fontSize: "11px",
    gap: "4px",
    justifyContent: "flex-end",
    margin: "12px 4px 0",
  }),
  frame: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "2xl",
    boxShadow: "md",
    color: "text.primary",
    margin: 0,
    padding: "16px 12px 12px",
    pointerEvents: "none",
  }),
  title: css({ fontSize: "15px", fontWeight: 600, margin: "0 4px 12px" }),
};

function stepTitle(step: Step, monthLabel: string) {
  if (step === "calendar") {
    return "端末カレンダーに追加";
  }
  if (step === "pick") {
    return "追加先";
  }
  if (typeof step === "object") {
    return "保存しました";
  }
  return `${monthLabel}のシフトを保存`;
}

// Saving a month: as a picture to show, or into the device calendar, from
// the heading's corner. It never opens by itself: a filled month shows as
// filled, and the corner is there whenever it is wanted.
export function SaveSheet({
  open,
  onOpenChange,
  month,
  shiftCount,
  offCount,
  toCalendar = false,
  onImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: Date;
  // Days with a shift this month, and how many of them are days off.
  shiftCount: number;
  offCount: number;
  // Opened from カレンダーに追加: straight to choosing the calendar.
  toCalendar?: boolean;
  // Opens the picture's preview, where it is saved or shared.
  onImage: () => void;
}) {
  const [chosenStep, setStep] = useState<Step>("choose");
  const step = toCalendar && chosenStep === "choose" ? "calendar" : chosenStep;
  // The system's default at first, then remembered from the last time,
  // so adding is a single tap.
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [includeOff, setIncludeOff] = useState(false);
  // Closed, it starts from the choice again next time.
  const change = (next: boolean) => {
    if (!next) {
      setStep("choose");
    }
    onOpenChange(next);
  };
  const close = () => {
    change(false);
  };
  const monthLabel = formatMonth(month);
  const count = includeOff ? shiftCount : shiftCount - offCount;
  const calendar = deviceCalendars.find((item) => item.id === calendarId);
  const title = stepTitle(step, monthLabel);
  return (
    <Sheet label={title} onOpenChange={change} open={open}>
      <SheetHeading
        onBack={
          (step === "calendar" && !toCalendar) || step === "pick"
            ? () => {
                setStep(step === "pick" ? "calendar" : "choose");
              }
            : undefined
        }
        onClose={close}
        title={title}
      />
      {step === "choose" && (
        <>
          <p className={sheetLead}>
            画像にして見せたり、端末のカレンダーにまとめて入れたりできます。
          </p>
          <div className={save.actions}>
            <Button
              variant="primary"
              onClick={() => {
                close();
                onImage();
              }}
            >
              <ImageIcon aria-hidden="true" size={18} />
              画像で保存
            </Button>
            <Button
              variant="quiet"
              disabled={shiftCount === 0}
              onClick={() => {
                setStep("calendar");
              }}
            >
              <CalendarPlus aria-hidden="true" size={18} />
              端末カレンダーに追加
            </Button>
          </div>
        </>
      )}
      {step === "calendar" && (
        <>
          <p className={sheetLead}>
            {monthLabel}のシフトを、1日ずつ予定として入れます。
          </p>
          <List>
            <ListRow
              label="追加先"
              onClick={() => {
                setStep("pick");
              }}
              value={
                <>
                  <span
                    aria-hidden="true"
                    className={save.valueDot}
                    style={{ background: calendar?.color }}
                  />
                  {calendar?.name}
                </>
              }
            />
            <SwitchRow
              label="休みの日も入れる"
              checked={includeOff}
              onChange={(checked) => {
                setIncludeOff(checked);
              }}
            />
          </List>
          <Button
            variant="primary"
            className={save.add}
            disabled={!calendar || count === 0}
            onClick={() => {
              setStep({
                done: `「${calendar?.name}」に${monthLabel}の予定を${count}件追加しました。`,
              });
            }}
          >
            {count}件を追加
          </Button>
        </>
      )}
      {step === "pick" && (
        <div className={cx(sheetBody, save.picker)}>
          {calendarSources.map(([source, items]) => (
            <Section key={source} title={source}>
              <List>
                {items?.map((item) => (
                  <ListRow
                    aria-pressed={calendarId === item.id}
                    arrow={
                      <Check
                        aria-hidden="true"
                        className={save.check({
                          picked: calendarId === item.id,
                        })}
                        size={18}
                      />
                    }
                    key={item.id}
                    label={item.name}
                    leading={
                      <>
                        <span
                          aria-hidden="true"
                          className={save.dot}
                          style={{ background: item.color }}
                        />
                      </>
                    }
                    onClick={() => {
                      setCalendarId(item.id);
                      setStep("calendar");
                    }}
                  />
                ))}
              </List>
            </Section>
          ))}
        </div>
      )}
      {typeof step === "object" && (
        <>
          <p className={cx(sheetLead, save.done)}>
            <Check aria-hidden="true" className={save.doneIcon} size={18} />
            {step.done}
          </p>
          <Button variant="primary" onClick={close}>
            閉じる
          </Button>
        </>
      )}
    </Sheet>
  );
}

export function ImagePreviewPage({
  month,
  schedule,
  options,
  onOptions,
  onClose,
}: {
  month: Date;
  schedule: Schedule;
  options: ImageOptions;
  onOptions: (options: ImageOptions) => void;
  onClose: () => void;
}) {
  const setNote = useContext(ToastContext);
  const weekTools = useWeek();
  const dates = weekTools.monthDates(month);
  const scheme = useContext(ColorSchemeContext);
  const { theme } = useContext(ThemeContext);
  const shown = options.scheme ?? scheme;
  const alwaysDark = presetOf(theme).scheme === "dark";
  // The month alone, as the calendar heads it: a calendar of marks says
  // for itself that it is shifts. In English as 月と曜日 asks, like the
  // weekdays under it.
  const title = monthWithYearOf(month, weekTools.english);
  return (
    <Screen>
      <ScreenScroll>
        <PageHeader back="カレンダー" onBack={onClose} title="画像で保存" />
        <CellNamesContext
          value={{
            names: {
              badge: options.names,
              emoji: options.names,
              icon: options.names,
            },
          }}
        >
          <OffHighlightContext
            value={{
              highlight: {
                badge: options.highlight,
                emoji: options.highlight,
                icon: options.highlight,
              },
            }}
          >
            <div className={previewWrap}>
              <ColorSchemeContext value={shown}>
                {/* A picture to share shows every day as it is. */}
                <OffDisplayContext value={options.blankOff ? "blank" : "show"}>
                  <figure
                    aria-label={`${monthWithYearOf(month)}のシフトの画像`}
                    className={picture.frame}
                    inert
                    style={themeStyle(theme, shown)}
                  >
                    <figcaption className={picture.title}>{title}</figcaption>
                    <WeekdayRow compact />
                    <div className={dayGrid}>
                      {dates.map((date) => (
                        <DayCell
                          active={false}
                          date={date}
                          editing={false}
                          entry={schedule[dateKey(date)]}
                          key={dateKey(date)}
                          onPress={() => undefined}
                          outside={date.getMonth() !== month.getMonth()}
                          plain
                        />
                      ))}
                    </div>
                    <p className={picture.credit}>
                      <AppIcon size={16} src={STORE_ICON} />
                      ポチカル
                    </p>
                  </figure>
                </OffDisplayContext>
              </ColorSchemeContext>
              {/* An always-dark テーマ saves its dark: its ☾ stays on. */}
              <PreviewSchemeSwitch
                disabled={alwaysDark}
                onPick={(picked) => {
                  onOptions({ ...options, scheme: picked });
                }}
                shown={alwaysDark ? "dark" : shown}
              />
            </div>
          </OffHighlightContext>
        </CellNamesContext>
        {/* The same tabs as the style page, with the picture's own values:
            it goes to people who do not know the marks, so names start on. */}
        <Section title="休みの見せ方">
          <OffLookTabs
            onChange={(value) => {
              onOptions({ ...options, ...value });
            }}
            value={options}
          />
        </Section>
        <Section title="シフト名">
          <NameTabs
            onChange={(names) => {
              onOptions({ ...options, names });
            }}
            value={options.names}
          />
        </Section>
        <Note>画像にだけ使う見た目です。アプリのスタイルは変わりません。</Note>
      </ScreenScroll>
      <div className={picture.actions} data-toast-above="">
        <Button
          variant="quiet"
          onClick={() => {
            setNote("LINEなどに送れるメニューが開きます（見本）");
          }}
        >
          <Share aria-hidden="true" size={18} />
          共有
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setNote("写真に保存しました");
          }}
        >
          <Download aria-hidden="true" size={18} />
          保存
        </Button>
      </div>
    </Screen>
  );
}
