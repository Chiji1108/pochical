import { GapSheetPreview } from "@pochical/prototype/components/design-gap-sheet";
import type { GapSheetProps } from "@pochical/prototype/components/design-gap-sheet";
import { LockScreen } from "@pochical/prototype/components/design-home-screen";
import {
  blankOffs,
  OffLooksContext,
} from "@pochical/prototype/components/shift-mark";
import {
  addDays,
  dateKey,
  gapDaysIn,
  initialDesignSchedule,
  periodOf,
} from "@pochical/prototype/lib/design-days";
import type { Schedule } from "@pochical/prototype/lib/design-days";
import { chatKey, groupChat } from "@pochical/prototype/lib/design-group-data";
import {
  sampleChats,
  sampleOthers,
} from "@pochical/prototype/lib/design-group-samples";
import {
  isDayOff,
  presetPatterns,
} from "@pochical/prototype/lib/design-patterns";
import type { PatternBook } from "@pochical/prototype/lib/design-patterns";
import {
  defaultReminders,
  notificationText,
} from "@pochical/prototype/lib/design-reminders";
import { designToday } from "@pochical/prototype/lib/design-today";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";

import { CalendarFrame, Frame, FrameRow, HomeFrame } from "./design-frames";
import { DesignOnboarding } from "./design-onboarding";
import type { OnboardingScreen } from "./design-onboarding";

// The rows of content/design/flows.mdx: each flow's screens in order, and
// the screens it branches out to, under the page's headings.

const variants = parseDesignVariants({});
const october = new Date(2026, 9, 1);
const OCTOBER = 9;

function OnboardingFrame({
  label,
  note,
  screen,
}: {
  label: string;
  note?: string;
  screen: OnboardingScreen;
}) {
  return (
    <Frame label={label} note={note}>
      <DesignOnboarding initialScreen={screen} variants={variants} />
    </Frame>
  );
}

export function FirstRun() {
  return (
    <FrameRow>
      <OnboardingFrame label="最初の画面" screen="welcome" />
      <OnboardingFrame label="働き方" screen="kind" />
      <OnboardingFrame label="順番" note="繰り返しがある人" screen="rotation" />
      <OnboardingFrame label="最初の日" screen="anchor" />
      <CalendarFrame
        label="カレンダー"
        note="1か月分が入る"
        person={{
          rules: [
            {
              sequence: ["day", "day", "night", "after", "off", "off"],
              start: new Date(2026, 7, 30),
            },
          ],
        }}
      />
    </FrameRow>
  );
}

export function FirstRunWithAccount() {
  return (
    <FrameRow>
      <OnboardingFrame label="ログイン" screen="login" />
      <CalendarFrame label="カレンダー" note="前のデータが戻る" />
    </FrameRow>
  );
}

// October entered up to the 8th, with 3, 4 and 7 left blank by 翌日へ,
// and the whole of October with its days off left blank.
const partialOctober: Schedule = Object.fromEntries(
  (
    [
      [1, "day"],
      [2, "day"],
      [5, "night"],
      [6, "after"],
      [8, "day"],
    ] as const
  ).map(([day, shift]) => [dateKey(new Date(2026, OCTOBER, day)), { shift }])
);
function filledGaps(schedule: Schedule): Schedule {
  return {
    ...schedule,
    ...Object.fromEntries(
      gapDaysIn(schedule, periodOf(october, 1)).map((date) => [
        dateKey(date),
        { shift: "off" as const },
      ])
    ),
  };
}

// The calendar just left entering, with the blank days sheet open over
// it. What differs between people is passed in; the rest is the sample.
function GapFrame({
  label,
  note,
  schedule = partialOctober,
  ...sheet
}: {
  label: string;
  note?: string;
  schedule?: Schedule;
} & Partial<GapSheetProps>) {
  const days = gapDaysIn(schedule, periodOf(october, 1));
  return (
    <CalendarFrame
      label={label}
      month={OCTOBER}
      note={note}
      overlay={
        <GapSheetPreview
          choices={[{ key: "off", label: presetPatterns.off.name }]}
          days={days}
          onBlankOff={() => undefined}
          onFill={() => undefined}
          {...sheet}
        />
      }
      person={{ schedule }}
    />
  );
}

export function GapCheck() {
  return (
    <FrameRow>
      <CalendarFrame
        editing
        label="入力中"
        month={OCTOBER}
        note="休みの日を翌日へで空ける"
        person={{ schedule: partialOctober }}
      />
      <GapFrame label="完了を押すと" />
      <CalendarFrame
        label="カレンダー"
        month={OCTOBER}
        note="空いた日に休みが入る"
        person={{ schedule: filledGaps(partialOctober) }}
      />
    </FrameRow>
  );
}

export function GapCheckByPerson() {
  return (
    <FrameRow fan>
      <OffLooksContext value={blankOffs}>
        <GapFrame
          choices={[
            { blank: true, key: "off", label: presetPatterns.off.name },
          ]}
          label="休みを空白で見せている人"
          note="空白のスイッチがない"
        />
      </OffLooksContext>
      <GapFrame
        choices={[
          { key: "off", label: presetPatterns.off.name },
          { key: "paid", label: presetPatterns.paid.name },
        ]}
        label="休みと有休がある人"
        note="入れるパターンを選べる"
      />
    </FrameRow>
  );
}

export function SettingsTop() {
  return (
    <FrameRow>
      <CalendarFrame label="設定" tab="settings" />
    </FrameRow>
  );
}

export function SettingsPages() {
  return (
    <FrameRow fan>
      <CalendarFrame label="スタイル" page="mark" tab="settings" />
      <CalendarFrame label="外観" page="appearance" tab="settings" />
      <CalendarFrame label="アプリアイコン" page="appIcon" tab="settings" />
      <CalendarFrame label="カレンダー" page="week" tab="settings" />
      <CalendarFrame label="リマインド" page="reminders" tab="settings" />
      <CalendarFrame
        label="チャットの通知"
        page="chatNotifications"
        tab="settings"
      />
      <CalendarFrame label="アカウント" page="account" tab="settings" />
    </FrameRow>
  );
}

// 前日 21:00's notification for the sample's 25th, a day of 残業, and the
// family chat's latest line, as they reach the lock screen.
const reminderDay = new Date(2026, 8, 25);
const reminderAt = new Date(2026, 8, 24, 21, 0);
const reminderEntry = initialDesignSchedule()[dateKey(reminderDay)] ?? {
  shift: "day",
};
const presetBook: PatternBook = presetPatterns;
const reminderShift = {
  entry: reminderEntry,
  pattern: presetBook[reminderEntry.shift] ?? presetPatterns.day,
};
const chatAt = new Date(2026, 8, 24, 10, 20);
const latest = sampleChats[chatKey("family", groupChat)]?.messages.at(-1);
const chatLine = `${
  sampleOthers("family").find((member) => member.id === latest?.from)?.name ??
  ""
}：${latest?.content.kind === "words" ? latest.content.text : ""}`;

export function ReminderTap() {
  return (
    <FrameRow>
      <Frame label="前日のリマインド" note="9月24日 21:00">
        <LockScreen
          when={reminderAt}
          {...notificationText(defaultReminders[0], reminderShift)}
        />
      </Frame>
      <CalendarFrame
        detail={reminderDay}
        label="カレンダー"
        note="その日を選んだ週で開く。開始前のリマインドも同じ"
      />
    </FrameRow>
  );
}

export function ChatTap() {
  return (
    <FrameRow>
      <Frame label="チャット" note="全体チャットのメッセージ">
        <LockScreen body={chatLine} title="家族" when={chatAt} />
      </Frame>
      <CalendarFrame
        groupPage="message"
        label="全体チャット"
        note="いちばん新しいメッセージで開く。個人チャットならそのチャット"
        tab="group"
      />
    </FrameRow>
  );
}

// Where the sample's widgets lead: today, the day off 次の休み counts
// (today on a day off), and a day further on, as one tapped in カレンダー
// or これから's columns.
const LOOKAHEAD = 62;
const TAPPED_DAY_OFFSET = 2;
const nextOffDay =
  Array.from({ length: LOOKAHEAD }, (_, index) =>
    addDays(designToday, index)
  ).find((day) => {
    const entry = initialDesignSchedule()[dateKey(day)];
    return entry !== undefined && isDayOff(presetBook[entry.shift]);
  }) ?? designToday;
const tappedDay = addDays(designToday, TAPPED_DAY_OFFSET);

export function WidgetTap() {
  return (
    <FrameRow>
      <HomeFrame label="ホーム画面" note="これから・次の休み・カレンダー" />
      <CalendarFrame
        detail={designToday}
        label="カレンダー"
        note="これから（小）は今日を選んだ週で開く。シンプルとロック画面も今日"
      />
    </FrameRow>
  );
}

export function NextOffTap() {
  return (
    <FrameRow>
      <CalendarFrame
        detail={nextOffDay}
        label="カレンダー"
        note="数えている休みの日を選んだ週で開く（今日が休みなら今日）。一緒に休む人やグループを選んでいれば、そのグループの表でその日"
      />
    </FrameRow>
  );
}

export function DayTap() {
  return (
    <FrameRow>
      <CalendarFrame
        detail={tappedDay}
        label="カレンダー"
        note="押した日を選んだ週で開く。シンプル（中）は今日か明日"
      />
    </FrameRow>
  );
}
