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
import { isDayOff } from "../lib/design-patterns";
import type { Pattern, PatternBook } from "../lib/design-patterns";
import { useSettings, withOffLook } from "../lib/design-settings-store";
import type { CalendarAdd, ImageOptions } from "../lib/design-settings-store";
import { AppIcon } from "./design-app-icon";
import { DayCell } from "./design-day-cell";
import { dayGrid, WeekdayRow } from "./design-day-grid";
import { PageHeader } from "./design-header";
import { List, ListRow, SwitchRow } from "./design-list";
import { monthWithYearOf } from "./design-month-name";
import { timeText } from "./design-pattern-editor";
import { NameTabs, OffLookRows } from "./design-settings-style";
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
  noOffLooks,
  OffLooksContext,
  ShiftMark,
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

type Step = "choose" | "calendar" | "pick" | "days" | { done: string };

// How 端末カレンダーに追加 goes in the demo: the calendars allowed,
// refused, or allowed and the adding failing.
export type CalendarAccess = "granted" | "denied" | "fails";

// What a day of the month puts in the device calendar (spec/calendar.md):
// its shift's event when its pattern is picked, and a memo's own event
// where no shift's event is.
export type CalendarDay = {
  // The shift's pattern, if any.
  pattern?: Pattern;
  note: boolean;
  // Someone works it with the person.
  people: boolean;
};

// The month's days, in order, as CalendarDay.
export function calendarDays(
  days: Date[],
  schedule: Schedule,
  book: PatternBook,
  notes: ReadonlySet<string>
): CalendarDay[] {
  return days.map((date) => {
    const entry = schedule[dateKey(date)];
    return {
      note: notes.has(dateKey(date)),
      pattern: entry === undefined ? undefined : book[entry.shift],
      people: (entry?.people?.length ?? 0) > 0,
    };
  });
}

// The patterns put in until the person picks otherwise: those with a
// time, and of those without, not the days off and not a pattern that
// follows another as its next day, like 明け after 夜勤, whose night shows
// on that day already.
export function shownAtFirst(patterns: readonly Pattern[]) {
  const following = new Set(patterns.map((pattern) => pattern.nextDay));
  return new Set(
    patterns
      .filter(
        (pattern) =>
          pattern.time !== undefined ||
          !(isDayOff(pattern) || following.has(pattern.id))
      )
      .map((pattern) => pattern.id)
  );
}

// The patterns put in: the first pick, as the person changed it.
function shownOf(patterns: readonly Pattern[], chosen: CalendarAdd["chosen"]) {
  const atFirst = shownAtFirst(patterns);
  return new Set(
    patterns
      .map((pattern) => pattern.id)
      .filter((id) => chosen[id] ?? atFirst.has(id))
  );
}

// What the row under 入れるシフト says is left out, every name of it.
function leftOut(listed: readonly Pattern[], shown: ReadonlySet<string>) {
  const out = listed.filter((pattern) => !shown.has(pattern.id));
  if (out.length === 0) {
    return "すべて入れます";
  }
  if (out.length === listed.length) {
    return "何も入れません";
  }
  return `${out.map((pattern) => pattern.name).join("・")}は入れません`;
}

// A pattern picked in or out, keeping only what differs from the first
// pick, of patterns still there, so a deleted one's leaves too.
function chosenWith(
  patterns: readonly Pattern[],
  chosen: CalendarAdd["chosen"],
  id: string,
  on: boolean
) {
  const atFirst = shownAtFirst(patterns);
  const kept = Object.entries(chosen).filter(
    ([key]) => key !== id && patterns.some((pattern) => pattern.id === key)
  );
  return Object.fromEntries(
    on === atFirst.has(id) ? kept : [...kept, [id, on]]
  );
}

// How many events the days make.
function eventCount(days: CalendarDay[], shown: ReadonlySet<string>) {
  return days.filter(
    ({ pattern, note }) =>
      (pattern !== undefined && shown.has(pattern.id)) || note
  ).length;
}

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
  // The calendar, the days to put in and the rest, a list each.
  groups: css({ display: "flex", flexDirection: "column", gap: "24px" }),
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

// メモも入れる and 一緒に働く人も入れる, each only when it would put
// something in: a memo goes in any day, those on a day only in its
// shift's event.
function ExtraSwitches({
  days,
  shown,
}: {
  days: CalendarDay[];
  shown: ReadonlySet<string>;
}) {
  const putting = useSettings((state) => state.device.calendarAdd);
  const setPutting = useSettings((state) => state.setCalendarAdd);
  const notes = days.some((day) => day.note);
  const people = days.some(
    (day) =>
      day.people && day.pattern !== undefined && shown.has(day.pattern.id)
  );
  if (!(notes || people)) {
    return null;
  }
  return (
    <List>
      {notes && (
        <SwitchRow
          checked={putting.notes}
          detail="予定がない日は、メモだけの予定にします"
          label="メモも入れる"
          onChange={(checked) => {
            setPutting({ ...putting, notes: checked });
          }}
        />
      )}
      {people && (
        <SwitchRow
          checked={putting.people}
          detail="シフトの予定のメモ欄に入ります"
          label="一緒に働く人も入れる"
          onChange={(checked) => {
            setPutting({ ...putting, people: checked });
          }}
        />
      )}
    </List>
  );
}

function stepTitle(step: Step, monthLabel: string) {
  if (step === "calendar") {
    return "端末カレンダーに追加";
  }
  if (step === "pick") {
    return "追加先";
  }
  if (step === "days") {
    return "入れるシフト";
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
  days,
  patterns,
  access = "granted",
  toCalendar = false,
  onImage,
}: {
  access?: CalendarAccess;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: Date;
  // Each day of the month as it goes in.
  days: CalendarDay[];
  // The person's patterns in their order, those of a job left too.
  patterns: Pattern[];
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
  // 設定を開く stands in for the system's settings, coming back from them
  // with the calendars allowed, as the notifications' card does.
  const [allowedThere, setAllowedThere] = useState(false);
  const refused = access === "denied" && !allowedThere;
  const putting = useSettings((state) => state.device.calendarAdd);
  const setPutting = useSettings((state) => state.setCalendarAdd);
  const toast = useContext(ToastContext);
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
  const shown = shownOf(patterns, putting.chosen);
  // The shifts' events, and the memos' own where no shift's event is.
  const count = eventCount(
    putting.notes ? days : days.map((day) => ({ ...day, note: false })),
    shown
  );
  const shiftCount = days.filter((day) => day.pattern).length;
  // Those in use, and a pattern left that still shows in the month.
  const listed = patterns.filter(
    (pattern) =>
      pattern.archived !== true ||
      days.some((day) => day.pattern?.id === pattern.id)
  );
  const calendar = deviceCalendars.find((item) => item.id === calendarId);
  const title = stepTitle(step, monthLabel);
  return (
    <Sheet label={title} onOpenChange={change} open={open}>
      <SheetHeading
        onBack={
          (step === "calendar" && !toCalendar) ||
          step === "pick" ||
          step === "days"
            ? () => {
                setStep(step === "calendar" ? "choose" : "calendar");
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
      {step === "calendar" && refused && (
        <>
          <p className={sheetLead}>
            カレンダーへのアクセスが許可されていません。設定アプリで、ポチカルにカレンダーへのフルアクセスを許可してください。
          </p>
          <Button
            onClick={() => {
              setAllowedThere(true);
            }}
            variant="primary"
          >
            設定を開く
          </Button>
        </>
      )}
      {step === "calendar" && !refused && (
        <>
          <p className={sheetLead}>
            {monthLabel}のシフトを、1日ずつ予定として入れます。
          </p>
          <div className={save.groups}>
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
            </List>
            {/* Which patterns go in, on a page of their own: the first
                pick leaves out the days off and a night's next day like
                明け, and the row says what is left out. */}
            <List>
              <ListRow
                label="入れるシフト"
                onClick={() => {
                  setStep("days");
                }}
                detail={leftOut(listed, shown)}
              />
            </List>
            <ExtraSwitches days={days} shown={shown} />
          </div>
          <Note>前に入れた{monthLabel}の予定は、入れ直します。</Note>
          <Button
            variant="primary"
            className={save.add}
            disabled={!calendar || count === 0}
            onClick={() => {
              if (access === "fails") {
                toast("追加できませんでした", "problem");
                return;
              }
              setStep({
                done: `「${calendar?.name}」に${monthLabel}の予定を${count}件追加しました。`,
              });
            }}
          >
            {count}件を追加
          </Button>
        </>
      )}
      {step === "days" && (
        <div className={sheetBody}>
          <List>
            {listed.map((pattern) => {
              const on = shown.has(pattern.id);
              return (
                <ListRow
                  aria-pressed={on}
                  arrow={
                    <Check
                      aria-hidden="true"
                      className={save.check({ picked: on })}
                      size={18}
                    />
                  }
                  key={pattern.id}
                  label={pattern.name}
                  leading={<ShiftMark shift={pattern.id} size={20} />}
                  onClick={() => {
                    setPutting({
                      ...putting,
                      chosen: chosenWith(
                        patterns,
                        putting.chosen,
                        pattern.id,
                        !on
                      ),
                    });
                  }}
                  value={timeText(pattern)}
                />
              );
            })}
          </List>
          <Note>チェックしたシフトを、1日ずつ予定として入れます。</Note>
        </div>
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
  offPatterns,
  options,
  onOptions,
  onClose,
}: {
  month: Date;
  schedule: Schedule;
  // The patterns that count as off, those of a job left too, as an older
  // month holds them and 端末カレンダーに追加 offers them.
  offPatterns: Pattern[];
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
          <div className={previewWrap}>
            <ColorSchemeContext value={shown}>
              {/* A picture to share shows its own 休みの見せ方 for each
                    day off: the app's own does not reach it. */}
              <OffLooksContext
                value={{ off: options.off, offs: options.offs ?? noOffLooks }}
              >
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
              </OffLooksContext>
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
        </CellNamesContext>
        {/* The same tabs as the style page and in its order, with the
            picture's own values
            and named alone, the picture above showing them: it goes to
            people who do not know the marks, so names start on. */}
        <Section title="シフト名">
          <NameTabs
            onChange={(names) => {
              onOptions({ ...options, names });
            }}
            samples={false}
            value={options.names}
          />
        </Section>
        {offPatterns.length > 0 && (
          <Section title="休みの見せ方">
            <OffLookRows
              lookOf={(shift) => options.offs?.[shift] ?? options.off}
              offs={offPatterns}
              onChange={(shift, look) => {
                onOptions({
                  ...options,
                  offs: withOffLook(
                    options.offs,
                    shift,
                    look,
                    options.off,
                    offPatterns.map(({ id }) => id)
                  ),
                });
              }}
              samples={false}
            />
          </Section>
        )}
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
