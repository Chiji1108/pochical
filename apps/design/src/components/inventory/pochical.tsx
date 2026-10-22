import { MonthSummary } from "@pochical/prototype/components/design-calendar-heading";
import { DayCell } from "@pochical/prototype/components/design-day-cell";
import {
  dayGrid,
  WeekdayRow,
} from "@pochical/prototype/components/design-day-grid";
import { PhotoAvatar } from "@pochical/prototype/components/design-group-parts";
import { TabBar } from "@pochical/prototype/components/design-tab-bar";
import { useWeek } from "@pochical/prototype/components/design-week";
import {
  blankOffs,
  OffLooksContext,
  ShiftMark,
  ShiftMarkStyleContext,
} from "@pochical/prototype/components/shift-mark";
import type { ShiftMarkStyle } from "@pochical/prototype/components/shift-mark";
import { supportChatOf } from "@pochical/prototype/lib/design-support";
import {
  createUserStore,
  UserStoreContext,
} from "@pochical/prototype/lib/design-user-store";
import { css } from "@pochical/styled-system/css";

import { Item, Items } from "./item";

const styles = {
  // A day as big as on a month of five weeks.
  cell: css({ width: "46px" }),
  marks: css({ alignItems: "center", display: "flex", gap: "18px" }),
  // The tab bar floats over a phone's foot; here it floats in a strip.
  tabBarStage: css({
    "--tab-bar-bottom": "4px",
    height: "72px",
    position: "relative",
    width: "100%",
  }),
};

// The sample person the tab bar counts unread for: their groups' chats
// and an answer from support, so both counts show.
const tabBarPerson = createUserStore({ support: supportChatOf("answered") });

const cellDate = new Date(2026, 8, 8);

const markStyles: ShiftMarkStyle[] = ["icon", "emoji", "badge"];

// The pieces SwiftUI and Compose will build themselves: nothing in either
// platform draws them.
export function ShiftMarks() {
  return (
    <Items>
      {markStyles.map((style) => (
        <Item
          key={style}
          name={`ShiftMark(${style})`}
          ios="独自の View（同じ図柄を描く）"
          android="独自の Composable（同じ図柄を描く）"
          where="シフトが出るところすべて"
        >
          <ShiftMarkStyleContext value={style}>
            <span className={styles.marks}>
              <ShiftMark shift="day" size={24} />
              <ShiftMark early shift="day" size={24} />
              <ShiftMark late shift="day" size={24} />
            </span>
          </ShiftMarkStyleContext>
        </Item>
      ))}
    </Items>
  );
}

export function DayCells() {
  return (
    <Items>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="入力済み"
      >
        <Cell entry={{ shift: "day" }} />
      </Item>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="休み(色をつける)"
      >
        <Cell entry={{ shift: "off" }} />
      </Item>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="休み(空白)"
      >
        <OffLooksContext value={blankOffs}>
          <Cell entry={{ shift: "off" }} />
        </OffLooksContext>
      </Item>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="メモ"
      >
        <Cell entry={{ note: "棚卸し", shift: "day" }} />
      </Item>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="残業"
      >
        <Cell entry={{ end: "20:00", shift: "day" }} />
      </Item>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="選択中"
      >
        <Cell active entry={{ shift: "day" }} />
      </Item>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="未入力"
      >
        <Cell />
      </Item>
      <Item
        name="DayCell"
        ios="独自の View"
        android="独自の Composable"
        where="前後の月"
      >
        <Cell entry={{ note: "棚卸し", shift: "day" }} outside />
      </Item>
      <Item
        name="WeekdayRow + dayGrid"
        ios="Grid（7列）"
        android="LazyVerticalGrid(GridCells.Fixed(7))"
        where="カレンダー・メンバーの月・保存する画像・見た目の見本"
        wide
      >
        <WeekSample />
      </Item>
    </Items>
  );
}

export function BottomPieces() {
  return (
    <Items>
      <Item
        name="MonthSummary"
        ios="独自の行"
        android="独自の行"
        where="カレンダー下の今月のお休み、一緒の日を見ている間はその日数"
        wide
      >
        <MonthSummary
          days={9}
          month={new Date(2026, 8, 1)}
          onOpen={() => undefined}
        />
        <MonthSummary
          days={5}
          month={new Date(2026, 8, 1)}
          onOpen={() => undefined}
          person="田中"
        />
      </Item>
      <Item
        name="TabBar"
        ios="TabView（iOS 26 のガラスのタブバーは OS が描く）"
        android="NavigationBar"
        where="画面の一番下"
        wide
      >
        <div className={styles.tabBarStage}>
          <UserStoreContext value={tabBarPerson}>
            <TabBar active="calendar" onSelect={() => undefined} />
          </UserStoreContext>
        </div>
      </Item>
      <Item
        name="PhotoAvatar"
        ios="AsyncImage を Circle で切る、写真がなければ頭文字"
        android="Coil の AsyncImage ＋ CircleShape、なければ頭文字"
        where="グループのメンバー"
      >
        <span className={styles.marks}>
          <PhotoAvatar name="ゆうき" />
          <PhotoAvatar me name="自分" />
        </span>
      </Item>
    </Items>
  );
}

// The week of the sample day, under the weekday names, as every month
// grid lays out its days.
function WeekSample() {
  const { weekDates } = useWeek();
  return (
    <div>
      <WeekdayRow />
      <div className={dayGrid}>
        {weekDates(cellDate).map((date) => (
          <DayCell
            active={false}
            date={date}
            editing={false}
            entry={{ shift: date.getDay() === 0 ? "off" : "day" }}
            key={date.getDate()}
            onPress={() => undefined}
            outside={false}
          />
        ))}
      </div>
    </div>
  );
}

// A day as big as on a month of five weeks.
const sampleDay = css({ height: "56px", width: "100%" });

function Cell({
  entry,
  active = false,
  outside = false,
}: {
  entry?: Parameters<typeof DayCell>[0]["entry"];
  active?: boolean;
  outside?: boolean;
}) {
  return (
    <div className={styles.cell}>
      <DayCell
        active={active}
        className={sampleDay}
        date={cellDate}
        editing={false}
        entry={entry}
        onPress={() => undefined}
        outside={outside}
      />
    </div>
  );
}
