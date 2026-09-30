import {
  CalendarPlus,
  Check,
  Download,
  Image as ImageIcon,
  Share,
} from "lucide-react";
import { useContext, useState } from "react";
import { css, cva, cx } from "styled-system/css";

import type { ImageOptions } from "../lib/design-settings-store";
import { AppIcon } from "./design-app-icon";
import { DayCell, dateKey } from "./design-calendar";
import type { Schedule } from "./design-calendar";
import { NameTabs, OffLookTabs } from "./design-settings";
import { Sheet, SheetHeading } from "./design-sheet";
import {
  ColorSchemeContext,
  PreviewSchemeSwitch,
  presetOf,
  ThemeContext,
  themeStyle,
  previewWrap,
} from "./design-theme";
import { ToastContext } from "./design-toast";
import {
  Button,
  dayGrid,
  List,
  ListRow,
  listStyle,
  Note,
  PageHeader,
  Screen,
  ScreenScroll,
  Section,
  srOnly,
  SwitchRow,
  WeekdayRow,
} from "./design-ui";
import { useWeek } from "./design-week";
import {
  CellNamesContext,
  OffDisplayContext,
  OffHighlightContext,
} from "./shift-mark";

// Calendars on the device, as the system lists them.
const deviceCalendars = [
  { color: "#5b8def", id: "icloud-home", name: "ホーム", source: "iCloud" },
  { color: "#e0894a", id: "icloud-work", name: "仕事", source: "iCloud" },
  { color: "#4f9d69", id: "google", name: "さくらの予定", source: "Google" },
];

type Step = "choose" | "calendar" | { done: string };

const save = {
  // 画像で保存 over 端末カレンダーに追加.
  actions: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  add: css({ marginTop: "20px" }),
  calendars: css({ border: 0, margin: "0 0 12px", padding: 0 }),
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
    borderRadius: "50%",
    flexShrink: 0,
    height: "10px",
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
    borderRadius: "20px",
    boxShadow: "0 6px 18px var(--shadow-small)",
    color: "text.primary",
    margin: 0,
    padding: "16px 12px 12px",
    pointerEvents: "none",
  }),
  title: css({ fontSize: "15px", fontWeight: 600, margin: "0 4px 12px" }),
};

// Saving a month: as a picture to show, or into the device calendar. It
// also opens by itself when a month has just been filled in, the moment
// people most want to keep it.
export function SaveSheet({
  open,
  onOpenChange,
  month,
  shiftCount,
  offCount,
  completion,
  toCalendar = false,
  onImage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: Date;
  // Days with a shift this month, and how many of them are days off.
  shiftCount: number;
  offCount: number;
  completion: boolean;
  // Opened from カレンダーに追加: straight to choosing the calendar.
  toCalendar?: boolean;
  // Opens the picture's preview, where it is saved or shared.
  onImage: () => void;
}) {
  const [chosenStep, setStep] = useState<Step>("choose");
  const step = toCalendar && chosenStep === "choose" ? "calendar" : chosenStep;
  // Remembered from the last time, so adding again is a single tap.
  const [calendarId, setCalendarId] = useState<string>();
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
  const monthLabel = `${month.getMonth() + 1}月`;
  const count = includeOff ? shiftCount : shiftCount - offCount;
  const calendar = deviceCalendars.find((item) => item.id === calendarId);
  let title = completion
    ? `${monthLabel}のシフトが揃いました`
    : `${monthLabel}のシフトを保存`;
  if (step === "calendar") {
    title = "端末カレンダーに追加";
  } else if (typeof step === "object") {
    title = "保存しました";
  }
  return (
    <Sheet label={title} onOpenChange={change} open={open}>
      <SheetHeading
        onBack={
          step === "calendar" && !toCalendar
            ? () => {
                setStep("choose");
              }
            : undefined
        }
        onClose={close}
        title={title}
      />
      {step === "choose" && (
        <>
          <p>
            {completion ? "お疲れさまでした。" : ""}
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
          {completion && (
            <Button variant="subtle" onClick={close}>
              あとで
            </Button>
          )}
        </>
      )}
      {step === "calendar" && (
        <>
          <p>{monthLabel}のシフトを、選んだカレンダーに予定として入れます。</p>
          <fieldset className={cx(listStyle, save.calendars)}>
            <legend className={srOnly}>入れるカレンダー</legend>
            {deviceCalendars.map((item) => (
              <ListRow
                key={item.id}
                label={item.name}
                value={item.source}
                leading={
                  <>
                    <span
                      aria-hidden="true"
                      className={save.dot}
                      style={{ background: item.color }}
                    />
                  </>
                }
                control={
                  <>
                    <input
                      checked={calendarId === item.id}
                      className={srOnly}
                      name="device-calendar"
                      onChange={() => {
                        setCalendarId(item.id);
                      }}
                      type="radio"
                    />
                    <Check
                      aria-hidden="true"
                      className={save.check({
                        picked: calendarId === item.id,
                      })}
                      size={18}
                    />
                  </>
                }
              />
            ))}
          </fieldset>
          <List>
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
                done: `「${calendar?.name}」に${monthLabel}のシフトを${count}件追加しました。`,
              });
            }}
          >
            {count}件を追加
          </Button>
        </>
      )}
      {typeof step === "object" && (
        <>
          <p className={save.done}>
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
  const title = `${month.getFullYear()}年${month.getMonth() + 1}月のシフト`;
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
                    aria-label={`${title}の画像`}
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
