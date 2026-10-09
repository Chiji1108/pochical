import { useState } from "react";
import { css } from "styled-system/css";

import type { Shift } from "../lib/design-patterns";
import { Chip, ChipGroup, Tag } from "./design-choices";
import { List, SwitchRow } from "./design-list";
import { Sheet, SheetHeading, SheetPicture, sheetBody } from "./design-sheet";
import { Button } from "./design-ui";
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
};

export type GapSheetProps = {
  // The blank days to fill.
  days: Date[];
  // The person's patterns that count as a day off, in their order; it is
  // asked only with one.
  choices: OffChoice[];
  // Offered to people not showing days off blank yet: many leave them
  // blank for the look, which they keep while the days are filled. The
  // same setting as on the style page, said as what it does here.
  offerBlank: boolean;
  onFill: (key: Shift | undefined) => void;
  // Told as the days are filled with the switch on, and not before, so
  // closing the sheet changes nothing.
  onBlankOff: () => void;
};

// Asked, not explained: a blank day is most often a day off not entered,
// so the question is whether it is, and the button answers. The month is
// in the heading above, so the title leaves it out and fits one line.
function titleOf(days: Date[]) {
  return days.length === 1
    ? "この日はお休みですか？"
    : `この${days.length}日はお休みですか？`;
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
  days,
  choices,
  offerBlank,
  onFill,
  onBlankOff,
  onClose: close,
}: GapSheetProps & { onClose: () => void }) {
  const [picked, setPicked] = useState<Shift>();
  const [blank, setBlank] = useState(false);
  const current = choices.find(({ key }) => key === picked) ?? choices[0];
  return (
    <>
      <SheetHeading onClose={close} title={titleOf(days)} />
      <div className={sheetBody}>
        <div className={gap.body}>
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
                detail="お休みとして入れて、印は出しません"
                label="カレンダーでは空白で見せる"
                checked={blank}
                onChange={setBlank}
              />
            </List>
          )}
          <Button
            variant="primary"
            onClick={() => {
              close();
              if (blank) {
                onBlankOff();
              }
              onFill(current?.key);
            }}
          >
            {current?.label ?? "休み"}にする
          </Button>
        </div>
      </div>
    </>
  );
}
