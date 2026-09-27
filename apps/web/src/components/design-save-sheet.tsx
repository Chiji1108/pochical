import {
  CalendarPlus,
  Check,
  Download,
  Image as ImageIcon,
  Share,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import type { ImageOptions } from "../lib/design-settings-store";
import { DayCell, dateKey } from "./design-calendar";
import type { Schedule } from "./design-calendar";
import { NameTabs, OffLookTabs } from "./design-settings";
import { SheetHeading } from "./design-sheet";
import {
  ColorSchemeContext,
  PreviewSchemeSwitch,
  ThemeContext,
  ToneContext,
  themeStyle,
} from "./design-theme";
import { Button, PageHeader } from "./design-ui";
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

// Saving a month: as a picture to show, or into the device calendar. It
// also opens by itself when a month has just been filled in, the moment
// people most want to keep it.
export function SaveSheet({
  ref,
  month,
  shiftCount,
  offCount,
  completion,
  toCalendar = false,
  onImage,
}: {
  ref: RefObject<HTMLDialogElement | null>;
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
  const close = () => ref.current?.close();
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
    <dialog
      aria-label={title}
      className="dc-breakdown"
      onClose={() => {
        setStep("choose");
      }}
      ref={ref}
    >
      <button
        aria-label="保存を閉じる"
        className="dc-sheet-scrim"
        onClick={close}
        tabIndex={-1}
        type="button"
      />
      <section className="dc-sheet">
        <div aria-hidden="true" className="dc-sheet-handle" />
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
            <p className="dc-import-description">
              {completion ? "お疲れさまでした。" : ""}
              画像にして見せたり、端末のカレンダーにまとめて入れたりできます。
            </p>
            <div className="dc-save-actions">
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
              <Button
                variant="subtle"

                onClick={close}
              >
                あとで
              </Button>
            )}
          </>
        )}
        {step === "calendar" && (
          <>
            <p className="dc-import-description">
              {monthLabel}のシフトを、選んだカレンダーに予定として入れます。
            </p>
            <fieldset className="st-list dc-save-calendars">
              <legend className="dc-sr-only">入れるカレンダー</legend>
              {deviceCalendars.map((item) => (
                <label className="st-row" key={item.id}>
                  <span
                    aria-hidden="true"
                    className="dc-save-dot"
                    style={{ background: item.color }}
                  />
                  <span className="st-row-label">{item.name}</span>
                  <span className="st-row-value">{item.source}</span>
                  <input
                    checked={calendarId === item.id}
                    className="dc-sr-only"
                    name="device-calendar"
                    onChange={() => {
                      setCalendarId(item.id);
                    }}
                    type="radio"
                  />
                  <Check
                    aria-hidden="true"
                    className={`dc-save-check ${calendarId === item.id ? "" : "dc-save-unchecked"}`}
                    size={18}
                  />
                </label>
              ))}
            </fieldset>
            <div className="st-list">
              <label className="st-row">
                <span className="st-row-label">休みの日も入れる</span>
                <input
                  aria-checked={includeOff}
                  checked={includeOff}
                  className="pe-toggle"
                  onChange={(event) => {
                    setIncludeOff(event.target.checked);
                  }}
                  role="switch"
                  type="checkbox"
                />
              </label>
            </div>
            <Button
              variant="primary"
              className="dc-save-add"
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
            <p className="dc-import-description dc-save-done">
              <Check
                aria-hidden="true"
                className="dc-save-done-icon"
                size={18}
              />
              {step.done}
            </p>
            <Button
              variant="primary"

              onClick={close}
            >
              閉じる
            </Button>
          </>
        )}
      </section>
    </dialog>
  );
}

const savedNoteTime = 2200;

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
  const [note, setNote] = useState<string>();
  // The note after saving or sharing goes away by itself.
  useEffect(() => {
    if (!note) {
      return;
    }
    const timer = setTimeout(() => {
      setNote(undefined);
    }, savedNoteTime);
    return () => {
      clearTimeout(timer);
    };
  }, [note]);
  const weekTools = useWeek();
  const dates = weekTools.monthDates(month);
  const scheme = useContext(ColorSchemeContext);
  const { theme } = useContext(ThemeContext);
  const tone = useContext(ToneContext);
  const shown = options.scheme ?? scheme;
  const title = `${month.getFullYear()}年${month.getMonth() + 1}月のシフト`;
  return (
    <div className="dc-content st-screen">
      <div className="st-scroll">
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
            <div className="st-preview-wrap">
              <ColorSchemeContext value={shown}>
                {/* A picture to share shows every day as it is. */}
                <OffDisplayContext value={options.blankOff ? "blank" : "show"}>
                  <figure
                    aria-label={`${title}の画像`}
                    className="dc-image"
                    inert
                    style={themeStyle(theme, shown, tone)}
                  >
                    <figcaption className="dc-image-title">{title}</figcaption>
                    <div aria-hidden="true" className="dc-weekdays">
                      {weekTools.weekdays.map((day) => (
                        <span className={day.className} key={day.day}>
                          {day.label}
                        </span>
                      ))}
                    </div>
                    <div
                      className="dc-grid"
                      style={{ "--weeks": dates.length / 7 } as CSSProperties}
                    >
                      {dates.map((date) => (
                        <DayCell
                          active={false}
                          date={date}
                          editing={false}
                          entry={schedule[dateKey(date)]}
                          key={dateKey(date)}
                          onPress={() => undefined}
                          outside={date.getMonth() !== month.getMonth()}
                        />
                      ))}
                    </div>
                    <p className="dc-image-credit">ポチカル</p>
                  </figure>
                </OffDisplayContext>
              </ColorSchemeContext>
              <PreviewSchemeSwitch
                onPick={(picked) => {
                  onOptions({ ...options, scheme: picked });
                }}
                shown={shown}
              />
            </div>
          </OffHighlightContext>
        </CellNamesContext>
        {/* The same tabs as the style page, with the picture's own values:
            it goes to people who do not know the marks, so names start on. */}
        <section className="st-section">
          <h4>休みの見せ方</h4>
          <OffLookTabs
            onChange={(value) => {
              onOptions({ ...options, ...value });
            }}
            value={options}
          />
        </section>
        <section className="st-section">
          <h4>シフト名</h4>
          <NameTabs
            onChange={(names) => {
              onOptions({ ...options, names });
            }}
            value={options.names}
          />
        </section>
        <p className="st-note">
          画像にだけ使う見た目です。アプリのスタイルは変わりません。
        </p>
      </div>
      <div className="dc-image-actions">
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
      <p aria-live="polite" className="gr-toast" hidden={!note}>
        <Check aria-hidden="true" size={16} />
        {note}
      </p>
    </div>
  );
}
