import { useState } from "react";
import { css } from "styled-system/css";

import { formatMonth } from "../lib/design-days";
import type { Shift } from "../lib/design-patterns";
import {
  Sheet,
  SheetHeading,
  SheetPicture,
  sheetBody,
  sheetLead,
} from "./design-sheet";
import { Button, Chip, ChipGroup, List, SwitchRow, Tag } from "./design-ui";
import { weekdayNames } from "./design-week";

export type OffChoice = { key: Shift; label: string };

// A group of chips with room under it before what follows.
const spaced = css({ marginBottom: "16px" });
const gap = {
  // The offer to show days off blank, under the chips.
  blank: css({
    "& small": { color: "text.tertiary", textStyle: "caption" },
    margin: "0 0 16px",
  }),
  // Under the heading, scrolling when a month of blanks is too long for
  // the sheet. One piece, so the scrolling part's gap stays out of the
  // spacing below.
  body: css({ display: "flex", flexDirection: "column" }),
  // How the month's days off change, kept on one line.
  count: css({
    color: "accent.default",
    fontWeight: 700,
    margin: "0 2px",
    whiteSpace: "nowrap",
  }),
  line: css({ display: "block" }),
};

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
  open,
  onOpenChange,
  ...props
}: GapSheetProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet label={titleOf(props.days)} onOpenChange={onOpenChange} open={open}>
      <GapSheetBody
        {...props}
        onClose={() => {
          onOpenChange(false);
        }}
      />
    </Sheet>
  );
}

// The sheet as it stands open over a phone, for the flow diagrams: a
// modal dialog would open over the whole page instead of the small frame.
export function GapSheetPreview(props: GapSheetProps) {
  return (
    <SheetPicture over>
      <GapSheetBody {...props} onClose={() => undefined} />
    </SheetPicture>
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
  const monthLabel = formatMonth(month);
  return (
    <>
      <SheetHeading onClose={close} title={titleOf(days)} />
      <div className={sheetBody}>
        <div className={gap.body}>
          <p className={sheetLead}>
            {current?.label ?? "休み"}にすると、{monthLabel}のお休みが
            <strong className={gap.count}>
              {offCount}日 → {offCount + days.length}日
            </strong>
            になります。
            {sharing && (
              <span className={gap.line}>
                グループの人にもお休みが見えます。
              </span>
            )}
            {completes && (
              <span className={gap.line}>
                これで{monthLabel}が全部埋まります。
              </span>
            )}
          </p>
          <ChipGroup as="ul" className={spaced}>
            {days.map((day) => (
              <Tag as="li" key={day.getDate()}>
                {day.getDate()}日({weekdayNames[day.getDay()]})
              </Tag>
            ))}
          </ChipGroup>
          {choices.length > 1 && (
            <ChipGroup className={spaced} label="入れるパターン">
              {choices.map(({ key, label }) => (
                <Chip
                  selected={key === current?.key}
                  key={key}
                  onClick={() => {
                    setPicked(key);
                  }}
                >
                  {label}
                </Chip>
              ))}
            </ChipGroup>
          )}
          {offerBlank && (
            <List className={gap.blank}>
              <SwitchRow
                detail="入力中と週表示では薄く出ます"
                label="休みの日は空白で見せる"

                checked={blankOff}
                onChange={(checked) => {
                  onBlankOff(checked);
                }}
              />
            </List>
          )}
          <Button
            variant="primary"
            onClick={() => {
              close();
              onFill(current?.key);
            }}
          >
            {current ? `${current.label}にする` : "休みを追加して入れる"}
          </Button>
          <Button variant="subtle" onClick={close}>
            あとで入れる
          </Button>
        </div>
      </div>
    </>
  );
}
