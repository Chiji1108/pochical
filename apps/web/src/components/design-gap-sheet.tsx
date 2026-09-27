import { X } from "lucide-react";
import { useState } from "react";
import type { RefObject } from "react";

import type { Shift } from "../lib/design-patterns";

export type OffChoice = { key: Shift; label: string };

// Many people leave days off blank, pressing 翌日へ as other apps taught
// them. Rather than stop them while entering, 完了 asks once about the
// blanks between entered days and fills them with a day off in one tap,
// so friends see those days off. Blanks after the last entered day are
// left alone: those are more likely not decided yet.
export function GapSheet({
  ref,
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
}: {
  ref: RefObject<HTMLDialogElement | null>;
  month: Date;
  // The blank days, as labels like 3日(木).
  days: string[];
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
}) {
  const [picked, setPicked] = useState<Shift>();
  const current = choices.find(({ key }) => key === picked) ?? choices[0];
  const close = () => ref.current?.close();
  const monthLabel = `${month.getMonth() + 1}月`;
  // The month is in the heading above, so the title leaves it out and
  // fits one line.
  const title = `空いている日が${days.length}日あります`;
  return (
    <dialog aria-label={title} className="dc-breakdown" ref={ref}>
      <button
        aria-label="閉じる"
        className="dc-sheet-scrim"
        onClick={close}
        tabIndex={-1}
        type="button"
      />
      <section className="dc-sheet">
        <div aria-hidden="true" className="dc-sheet-handle" />
        <header className="dc-sheet-heading">
          <h4>{title}</h4>
          <button aria-label="閉じる" onClick={close} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
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
            <li key={day}>{day}</li>
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
          className="dc-import-primary"
          onClick={() => {
            close();
            onFill(current?.key);
          }}
          type="button"
        >
          {current ? `${current.label}にする` : "休みを追加して入れる"}
        </button>
        <button className="dc-import-later" onClick={close} type="button">
          あとで入れる
        </button>
      </section>
    </dialog>
  );
}
