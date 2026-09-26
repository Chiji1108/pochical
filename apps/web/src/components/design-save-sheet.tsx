import {
  CalendarPlus,
  Check,
  ChevronLeft,
  Download,
  Image as ImageIcon,
  Share,
  X,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import type { ColorScheme } from "../lib/design-tokens";
import { DayCell, dateKey } from "./design-calendar";
import type { Schedule } from "./design-calendar";
import {
  ColorSchemeContext,
  PreviewSchemeSwitch,
  ThemeContext,
  ToneContext,
  themeStyle,
} from "./design-theme";
import { useWeek } from "./design-week";
import { CellNamesContext, OffHighlightContext } from "./shift-mark";

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
  onImage,
}: {
  ref: RefObject<HTMLDialogElement | null>;
  month: Date;
  // Days with a shift this month, and how many of them are days off.
  shiftCount: number;
  offCount: number;
  completion: boolean;
  // Opens the picture's preview, where it is saved or shared.
  onImage: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
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
        <header className="dc-sheet-heading">
          {step === "calendar" ? (
            <button
              aria-label="戻る"
              className="dc-save-back"
              onClick={() => {
                setStep("choose");
              }}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </button>
          ) : null}
          <h4>{title}</h4>
          <button aria-label="閉じる" onClick={close} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        {step === "choose" && (
          <>
            <p className="dc-import-description">
              {completion ? "お疲れさまでした。" : ""}
              画像にして見せたり、端末のカレンダーにまとめて入れたりできます。
            </p>
            <div className="dc-save-actions">
              <button
                className="dc-import-primary"
                onClick={() => {
                  close();
                  onImage();
                }}
                type="button"
              >
                <ImageIcon aria-hidden="true" size={18} />
                画像で保存
              </button>
              <button
                className="dc-save-secondary"
                disabled={shiftCount === 0}
                onClick={() => {
                  setStep("calendar");
                }}
                type="button"
              >
                <CalendarPlus aria-hidden="true" size={18} />
                端末カレンダーに追加
              </button>
            </div>
            {completion && (
              <button className="dc-import-later" onClick={close} type="button">
                あとで
              </button>
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
            <button
              className="dc-import-primary dc-save-add"
              disabled={!calendar || count === 0}
              onClick={() => {
                setStep({
                  done: `「${calendar?.name}」に${monthLabel}のシフトを${count}件追加しました。`,
                });
              }}
              type="button"
            >
              {count}件を追加
            </button>
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
            <button className="dc-import-primary" onClick={close} type="button">
              閉じる
            </button>
          </>
        )}
      </section>
    </dialog>
  );
}

// How the picture shows your month. It starts from what others can read,
// since they do not know your marks, and keeps what you choose next time.
// `scheme` is the picture's own light or dark; until picked, it follows
// the screen.
export type ImageOptions = {
  names: boolean;
  highlight: boolean;
  scheme?: ColorScheme;
};

export const defaultImageOptions: ImageOptions = {
  highlight: true,
  names: true,
};

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
        <header className="st-page-header">
          <button className="st-back" onClick={onClose} type="button">
            <ChevronLeft aria-hidden="true" size={20} />
            カレンダー
          </button>
          <h3 className="st-title">画像で保存</h3>
        </header>
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
        <div className="st-list">
          <label className="st-row">
            <span className="st-row-label">シフト名を表示</span>
            <input
              aria-checked={options.names}
              checked={options.names}
              className="pe-toggle"
              onChange={(event) => {
                onOptions({ ...options, names: event.target.checked });
              }}
              role="switch"
              type="checkbox"
            />
          </label>
          <label className="st-row">
            <span className="st-row-label">休みを目立たせる</span>
            <input
              aria-checked={options.highlight}
              checked={options.highlight}
              className="pe-toggle"
              onChange={(event) => {
                onOptions({ ...options, highlight: event.target.checked });
              }}
              role="switch"
              type="checkbox"
            />
          </label>
        </div>
        <p className="st-note">
          画像にだけ使う見た目です。アプリのスタイルは変わりません。
        </p>
      </div>
      <div className="dc-image-actions">
        <button
          className="dc-save-secondary"
          onClick={() => {
            setNote("LINEなどに送れるメニューが開きます（見本）");
          }}
          type="button"
        >
          <Share aria-hidden="true" size={18} />
          共有
        </button>
        <button
          className="dc-import-primary"
          onClick={() => {
            setNote("写真に保存しました");
          }}
          type="button"
        >
          <Download aria-hidden="true" size={18} />
          保存
        </button>
      </div>
      <p aria-live="polite" className="gr-toast" hidden={!note}>
        <Check aria-hidden="true" size={16} />
        {note}
      </p>
    </div>
  );
}
