import { Download, Info, Share } from "lucide-react";
import { useMotionValue } from "motion/react";
import { useContext, useState } from "react";
import type { ReactNode } from "react";

import {
  dateKey,
  daysOfMonth,
  formatDay,
  formatMonth,
  isSameMonth,
  monthAfter,
  movesText,
} from "../lib/design-days";
import { designMonth, designToday } from "../lib/design-today";
import { Tag } from "./design-choices";
import {
  changeOn,
  everyoneOff,
  patternOn,
  sameMonth,
  togetherIn,
} from "./design-group-data";
import type { Group, Member, TimeChange } from "./design-group-data";
import { Avatar, MemberMark } from "./design-group-parts";
import { MonthRow, ScrollingShifts } from "./design-group-shifts-list";
import { shiftsPage } from "./design-group-shifts-parts";
import type { Layout } from "./design-group-shifts-parts";
import { PeoplePicker, PersonPager } from "./design-group-shifts-person";
import { PagedTogether } from "./design-group-shifts-together";
import { BackButton, PageHeader } from "./design-header";
import { List, ListRow } from "./design-list";
import {
  MenuItem,
  MenuPicker,
  MenuSeparator,
  PullDownMenu,
} from "./design-menu";
import { monthIndex } from "./design-rolling";
import { PhoneContext, Sheet, sheetBody, SheetHeading } from "./design-sheet";
import { ToastContext } from "./design-toast";
import { useWeek } from "./design-week";

// Everyone's shifts in a group: by day, by week or one person at a time,
// the days everyone is off, and a picked day's sheet.

const layoutOptions: { value: Layout; label: string }[] = [
  { label: "一覧", value: "days" },
  { label: "週ごと", value: "weeks" },
  { label: "1人ずつ", value: "person" },
];

export function ShiftsPage({
  group,
  backLabel,
  day,
  month: initialMonth,
  layout,
  onLayout: setLayout,
  onBack,
  onShareDay,
}: {
  group: Group;
  backLabel: string;
  // A day to open picked, from 次のみんな休み.
  day?: Date;
  month?: Date;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onBack: () => void;
  onShareDay: (date: Date) => void;
}) {
  const weekTools = useWeek();
  const [month, setMonth] = useState(initialMonth ?? designMonth);
  // Whom 1人ずつ shows; chosen above the month, like a filter.
  const [personId, setPersonId] = useState(
    group.members.find((member) => !member.me)?.id ?? group.members[0].id
  );
  // Whose marks the legend sheet shows; kept while it closes.
  const [legendOf, setLegendOf] = useState(personId);
  const [legendOpen, setLegendOpen] = useState(false);
  const [picked, setPicked] = useState<Date | undefined>(day);
  const toast = useContext(ToastContext);
  const dates = weekTools.monthDates(month);
  const pick = (date: Date) => {
    setPicked(picked && dateKey(picked) === dateKey(date) ? undefined : date);
  };
  // A list of months pins the page's header over it, with the month row.
  const scrolling = layout !== "person";
  const header = (
    <PageHeader
      inlineTitle={group.name}
      leading={<BackButton onClick={onBack}>{backLabel}</BackButton>}
      trailing={
        <ShiftsMenu
          layout={layout}
          onLayout={setLayout}
          onLegend={() => {
            setLegendOf(personId);
            setLegendOpen(true);
          }}
          onSave={() => {
            toast(`${formatMonth(month)}のシフト表を写真に保存しました`);
          }}
        />
      }
    />
  );
  return (
    <div className={shiftsPage.root({ withSheet: picked !== undefined })}>
      {!scrolling && header}
      <PagedShifts
        dates={dates}
        group={group}
        header={header}
        layout={layout}
        month={month}
        onMember={(member) => {
          setLegendOf(member.id);
          setLegendOpen(true);
        }}
        onMonth={setMonth}
        onPerson={setPersonId}
        onPickDay={pick}
        personId={personId}
        picked={picked}
      />
      <PickedDaySheet
        date={picked}
        members={group.members}
        onClose={() => {
          setPicked(undefined);
        }}
        onShare={onShareDay}
      />
      <LegendSheet
        members={group.members}
        onOpenChange={setLegendOpen}
        onPick={setLegendOf}
        open={legendOpen}
        picked={legendOf}
      />
    </div>
  );
}

// One pull-down for the page's secondary actions: how the table is laid
// out, what the marks mean, and saving it as a picture.
function ShiftsMenu({
  layout,
  onLayout,
  onLegend,
  onSave,
}: {
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onLegend: () => void;
  onSave: () => void;
}) {
  const current = layoutOptions.find((option) => option.value === layout);
  return (
    <PullDownMenu label={current?.label}>
      <MenuPicker
        onValueChange={onLayout}
        options={layoutOptions}
        value={layout}
      />
      <MenuSeparator />
      <MenuItem
        icon={<Info aria-hidden="true" size={18} />}
        onSelect={onLegend}
        value="legend"
      >
        シフトパターン
      </MenuItem>
      <MenuItem
        icon={<Download aria-hidden="true" size={18} />}
        onSelect={onSave}
        value="save"
      >
        画像で保存
      </MenuItem>
    </PullDownMenu>
  );
}

function PagedShifts({
  group,
  header,
  layout,
  month,
  dates,
  picked,
  onMonth,
  onPickDay,
  onMember,
  personId,
  onPerson,
}: {
  group: Group;
  // The page's header, pinned with the month over a list of months.
  header: ReactNode;
  layout: Layout;
  month: Date;
  dates: Date[];
  picked?: Date;
  onMonth: (month: Date) => void;
  onPickDay: (date: Date) => void;
  onMember: (member: Member) => void;
  // Whom 1人ずつ shows, which シフトパターン opens on too.
  personId: string;
  onPerson: (id: string) => void;
}) {
  const { weekStart } = useWeek();
  // How far 1人ずつ's pages are dragged, which the month row follows, and
  // the month a swipe last landed on, whose name the drag brought in.
  const pageDrag = useMotionValue(0);
  const [swipedTo, setSwipedTo] = useState<number>();
  const goTo = (target: Date) => {
    setSwipedTo(undefined);
    onMonth(target);
  };
  const person =
    group.members.find((member) => member.id === personId) ?? group.members[0];
  const together = togetherIn(
    group.members,
    dates.filter((date) => sameMonth(date, month))
  );
  const thisMonth = isSameMonth(month, designToday);
  if (layout !== "person") {
    // Remounted per layout and week start, so each opens where the other
    // left off, with its weeks as the settings draw them.
    return (
      <ScrollingShifts
        group={group}
        header={header}
        key={`${layout}-${weekStart}`}
        layout={layout}
        month={month}
        onMember={onMember}
        onMonth={onMonth}
        onPickDay={onPickDay}
        picked={picked}
      />
    );
  }
  return (
    <>
      <PeoplePicker members={group.members} onPick={onPerson} picked={person} />
      <MonthRow
        month={month}
        onPick={goTo}
        onToday={
          thisMonth
            ? undefined
            : () => {
                goTo(monthAfter(designToday, 0));
              }
        }
        progress={pageDrag}
        swiped={swipedTo === monthIndex(month)}
        unit="月"
      />
      <PersonPager
        group={group}
        member={person}
        month={month}
        onMonth={(target) => {
          onMonth(target);
          setSwipedTo(monthIndex(target));
        }}
        progress={pageDrag}
        onPickDay={onPickDay}
        picked={picked}
      />
      <PagedTogether
        beside={{
          next: togetherIn(group.members, daysOfMonth(monthAfter(month, 1))),
          previous: togetherIn(
            group.members,
            daysOfMonth(monthAfter(month, -1))
          ),
        }}
        month={month}
        onPickDay={onPickDay}
        progress={pageDrag}
        swiped={swipedTo === monthIndex(month)}
        together={together}
      />
    </>
  );
}

// Whether an element shows within the screen's scroll, and a big group's
// table frame, not scrolled or swiped out of them.
function inSight(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const views = ["[data-table-scroll]", "[data-screen-scroll]"]
    .map((selector) => element.closest(selector))
    .filter((view) => view !== null);
  return (
    views.length > 0 &&
    views.every((view) => {
      const frame = view.getBoundingClientRect();
      return (
        bounds.bottom > frame.top &&
        bounds.top < frame.bottom &&
        bounds.right > frame.left &&
        bounds.left < frame.right
      );
    })
  );
}

// The day picked in the table, in a sheet along the bottom. It leaves the
// table undimmed and live: the picked day stays framed above it, and
// picking another day switches the sheet to that day.
function PickedDaySheet({
  date: picked,
  members,
  onClose,
  onShare,
}: {
  date?: Date;
  members: Member[];
  onClose: () => void;
  // Sends the day, everyone's shifts on it, to the group chat.
  onShare: (date: Date) => void;
}) {
  // The day stays while the sheet sinks away.
  const [date, setDate] = useState(picked ?? designToday);
  if (picked && picked !== date) {
    setDate(picked);
  }
  const phone = useContext(PhoneContext);
  const together = everyoneOff(members, date);
  return (
    <Sheet
      // Back to the day in the table, in whichever layout shows it, while
      // it is in sight; once scrolled or swiped away, to the month's name,
      // which says where the table is, rather than pulling the day back.
      finalFocusEl={() => {
        const root = phone?.current ?? document;
        const day = root.querySelector<HTMLElement>(
          `[data-pick-day="${dateKey(date)}"]`
        );
        if (day && inSight(day)) {
          return day;
        }
        const title = [
          ...root.querySelectorAll<HTMLElement>("[data-month-title]"),
        ].find((element) => element.offsetParent !== null);
        return title ?? day;
      }}
      label={formatDay(date)}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={picked !== undefined}
    >
      <SheetHeading
        action={{
          icon: <Share aria-hidden="true" size={18} />,
          label: "全体チャットで共有",
          onClick: () => {
            onShare(date);
          },
        }}
        onClose={onClose}
        title={formatDay(date)}
      >
        {together && (
          <Tag size="sm" tone="accent">
            みんな休み
          </Tag>
        )}
      </SheetHeading>
      <div className={sheetBody}>
        <List>
          {members.map((member) => {
            const item = patternOn(member, date);
            return (
              <ListRow
                key={member.id}
                label={member.name}
                truncate
                value={
                  <>
                    {item && (
                      <MemberMark
                        date={date}
                        look={item.look}
                        member={member}
                        size={18}
                      />
                    )}
                    {item?.name ?? "未入力"}
                    <DaySheetTime
                      change={changeOn(member, date)}
                      time={item?.time}
                    />
                  </>
                }
                leading={
                  <>
                    <Avatar member={member} />
                  </>
                }
                valueClassName={shiftsPage.sheetValue}
              />
            );
          })}
        </List>
      </div>
    </Sheet>
  );
}

// What each mark means, one person at a time in their own style, chosen
// by the chips over the list as 1人ずつ chooses whom to show. It opens on
// the face pressed in the table, or from the menu on whom 1人ずつ shows,
// so it is as long as one person's patterns however big the group.
function LegendSheet({
  open,
  onOpenChange,
  members,
  picked,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  picked: string;
  onPick: (id: string) => void;
}) {
  const member =
    members.find((candidate) => candidate.id === picked) ?? members[0];
  return (
    <Sheet label="シフトパターン" onOpenChange={onOpenChange} open={open}>
      <SheetHeading
        onClose={() => {
          onOpenChange(false);
        }}
        title="シフトパターン"
      />
      {/* The chips stay in reach; only the marks scroll. */}
      <div className={shiftsPage.legendPeople}>
        <PeoplePicker members={members} onPick={onPick} picked={member} />
      </div>
      {/* Everyone's lists lie unseen under the one shown, so the sheet
          stays as tall as the longest, up to its limit, and the chips
          stay under the finger from one person to the next. Only a list
          longer than the room scrolls. */}
      <div className={shiftsPage.legendBody}>
        <div aria-hidden="true" className={shiftsPage.legendSizer} inert>
          {members.map((candidate) => (
            <PatternList key={candidate.id} member={candidate} />
          ))}
        </div>
        <div className={shiftsPage.legendScroll}>
          <PatternList member={member} />
        </div>
      </div>
    </Sheet>
  );
}

function PatternList({ member }: { member: Member }) {
  return (
    <List>
      {member.patterns.map((item) => (
        <ListRow
          key={item.id}
          label={item.name}
          leading={<MemberMark look={item.look} member={member} size={20} />}
          value={item.time ?? ""}
        />
      ))}
    </List>
  );
}

// A member's hours in the day sheet: 早出 and 残業 said in words, with
// the day's actual hours instead of the pattern's.
function DaySheetTime({
  time,
  change,
}: {
  time?: string;
  change?: TimeChange;
}) {
  if (change) {
    return (
      <small className={shiftsPage.sheetTime}>
        <strong>{movesText(change)}</strong> {change.time}
      </small>
    );
  }
  return time ? <small className={shiftsPage.sheetTime}>{time}</small> : null;
}
