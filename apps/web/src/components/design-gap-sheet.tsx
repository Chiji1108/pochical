import { useState } from "react";
import type { RefObject } from "react";

import type { Shift } from "../lib/design-patterns";
import type { Schedule } from "./design-calendar";
import { SheetHeading } from "./design-sheet";

export type OffChoice = { key: Shift; label: string };

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function keyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Many people leave days off blank, pressing 翌日へ as other apps taught
// them. Rather than stop them while entering, 完了 asks once about the
// blanks between entered days and fills them with a day off in one tap.
// Blanks after the last entered day are left alone: those are more likely
// not decided yet.
export function gapDaysIn(schedule: Schedule, month: Date) {
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  const days = Array.from(
    { length: count },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)
  );
  const lastEntered = days.findLast((date) => schedule[keyOf(date)]);
  return days.filter(
    (date) =>
      lastEntered !== undefined && date < lastEntered && !schedule[keyOf(date)]
  );
}

export type GapSheetProps = {
  month: Date;
  // The blank days to fill.
  days: Date[];
  // Why to fill them, for everyone: the month's days off, which the
  // summary counts, grow by the blanks. Friends seeing them only matters
  // to people in a group, and filling the whole month leads on to saving.
  offCount: number;
  sharing: boolean;
  completes: boolean;
  // The person's patterns that count as a day off, in their order. None
  // means they removed 休み, most likely because blank meant off to them,
  // so it is added back to fill with.
  choices: OffChoice[];
  // Offered to people not showing days off blank yet: many leave them
  // blank for the look, which they can keep while the day is still a day
  // off. The same setting as on the style page, said as what it does.
  offerBlank: boolean;
  blankOff: boolean;
  onFill: (key: Shift | undefined) => void;
  onBlankOff: (blankOff: boolean) => void;
};

// The month is in the heading above, so the title leaves it out and fits
// one line.
function titleOf(days: Date[]) {
  return `空いている日が${days.length}日あります`;
}

export function GapSheet({
  ref,
  ...props
}: GapSheetProps & { ref: RefObject<HTMLDialogElement | null> }) {
  const close = () => ref.current?.close();
  return (
    <dialog aria-label={titleOf(props.days)} className="dc-breakdown" ref={ref}>
      <button
        aria-label="閉じる"
        className="dc-sheet-scrim"
        onClick={close}
        tabIndex={-1}
        type="button"
      />
      <GapSheetBody {...props} onClose={close} />
    </dialog>
  );
}

// The sheet as it stands open over a phone, for the flow diagrams: a
// modal dialog would open over the whole page instead of the small frame.
export function GapSheetPreview(props: GapSheetProps) {
  return (
    <div className="dc-sheet-preview">
      <div className="dc-sheet-scrim" />
      <GapSheetBody {...props} onClose={() => undefined} />
    </div>
  );
}

function GapSheetBody({
  month,
  days,
  offCount,
  sharing,
  completes,
  choices,
  offerBlank,
  blankOff,
  onFill,
  onBlankOff,
  onClose: close,
}: GapSheetProps & { onClose: () => void }) {
  const [picked, setPicked] = useState<Shift>();
  const current = choices.find(({ key }) => key === picked) ?? choices[0];
  const monthLabel = `${month.getMonth() + 1}月`;
  return (
    <section className="dc-sheet">
      <div aria-hidden="true" className="dc-sheet-handle" />
      <SheetHeading onClose={close} title={titleOf(days)} />
      <p className="dc-import-description">
        {current?.label ?? "休み"}にすると、{monthLabel}のお休みが
        <strong className="dc-gap-count">
          {offCount}日 → {offCount + days.length}日
        </strong>
        になります。
        {sharing && (
          <span className="dc-gap-line">
            グループの人にもお休みが見えます。
          </span>
        )}
        {completes && (
          <span className="dc-gap-line">
            これで{monthLabel}が全部埋まります。
          </span>
        )}
      </p>
      <ul className="dc-gap-days">
        {days.map((day) => (
          <li key={day.getDate()}>
            {day.getDate()}日({weekdays[day.getDay()]})
          </li>
        ))}
      </ul>
      {choices.length > 1 && (
        <fieldset className="dc-gap-choices">
          <legend className="dc-sr-only">入れるパターン</legend>
          {choices.map(({ key, label }) => (
            <button
              aria-pressed={key === current?.key}
              key={key}
              onClick={() => {
                setPicked(key);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </fieldset>
      )}
      {offerBlank && (
        <div className="st-list dc-gap-blank">
          <label className="st-row">
            <span className="st-row-label">
              休みの日は空白で見せる
              <small>入力中と週表示では薄く出ます</small>
            </span>
            <input
              aria-checked={blankOff}
              checked={blankOff}
              className="pe-toggle"
              onChange={(event) => {
                onBlankOff(event.target.checked);
              }}
              role="switch"
              type="checkbox"
            />
          </label>
        </div>
      )}
      <button
        className="ui-button ui-button-primary"
        onClick={() => {
          close();
          onFill(current?.key);
        }}
        type="button"
      >
        {current ? `${current.label}にする` : "休みを追加して入れる"}
      </button>
      <button
        className="ui-button ui-button-subtle"
        onClick={close}
        type="button"
      >
        あとで入れる
      </button>
    </section>
  );
}
