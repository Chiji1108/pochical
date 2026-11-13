import type { Entering } from "@pochical/prototype/components/design-calendar";
import {
  dateKey,
  daysMovedOn,
  daysOfMonth,
  initialDesignSchedule,
  withShiftEntered,
} from "@pochical/prototype/lib/design-days";
import type { Schedule } from "@pochical/prototype/lib/design-days";
import { chatKey, groupChat } from "@pochical/prototype/lib/design-group-data";
import type { Chat } from "@pochical/prototype/lib/design-group-data";
import {
  oldFriendsGroup,
  sampleChats,
  sampleOthers,
  workplaceGroup,
} from "@pochical/prototype/lib/design-group-samples";
import { presetPatterns } from "@pochical/prototype/lib/design-patterns";
import { useSamplePerson } from "@pochical/prototype/lib/design-sample-person";
import { designMonth } from "@pochical/prototype/lib/design-today";
import { useEffect, useSyncExternalStore } from "react";

import {
  BEATS,
  moves,
  placeNow,
  SCENES,
  stepOf,
  subscribe,
} from "../lib/story";
import { featureScreens, HERO_FIRST_BLANK, PhoneScreen } from "./lp-screens";

// /next's phones (pages/next.astro): the app's own screens, as the top
// page's are (lp-screens.tsx), each showing as much of its part of the
// story as the page is scrolled through it. What a phone shows is worked
// out from the place alone, so scrolling back takes it back. The build
// draws each as `drawn`; where the page does not move with its scroll
// (lib/story.ts), each stands at `still`.
function useStoryStep(
  stepAt: (place: number) => number,
  { drawn, still }: { drawn: number; still: number }
) {
  return useSyncExternalStore(
    subscribe,
    () => (moves() ? stepAt(placeNow()) : still),
    () => drawn
  );
}

// The sample month as ポチポチ入力's keys enter it: each press, the day it
// is made on, and the days as they were before it. 夜勤 fills the day after
// too, so the next press is a day further on.
const monthDays = daysOfMonth(designMonth);
const blank: Schedule = {};
function pressesOf(sample: Schedule) {
  const made: { date: Date; shift: string; before: Schedule }[] = [];
  let days = blank;
  for (let day = 0; day < monthDays.length;) {
    const date = monthDays[day];
    const shift = sample[dateKey(date)]?.shift;
    if (shift === undefined) {
      day += 1;
    } else {
      made.push({ before: days, date, shift });
      days = withShiftEntered(days, date, shift, presetPatterns);
      day += daysMovedOn(shift, presetPatterns);
    }
  }
  return { filled: days, presses: made };
}
const { filled, presses } = pressesOf(initialDesignSchedule());

// Entering's steps: the month before entering starts (BEFORE), then two
// for each press, the key going down and the day filled with the next
// day picked, and the month full at the end.
const BEFORE = -1;
const entrySteps = presses.length * 2 + 1;
const entryAt = (place: number) =>
  place < BEATS.entry.from ? BEFORE : stepOf(SCENES.entry, entrySteps, place);
// Standing still, the month is entered up to the day the top page's hero
// starts on, the keys under it.
const entryStill =
  presses.findIndex(({ date }) => date.getDate() >= HERO_FIRST_BLANK) * 2;

function entryOf(step: number): { days: Schedule; entering?: Entering } {
  if (step === BEFORE) {
    return { days: blank };
  }
  const press = presses[Math.floor(step / 2)];
  if (press === undefined) {
    return {
      days: filled,
      entering: { date: monthDays.at(-1) ?? designMonth },
    };
  }
  return {
    days: press.before,
    entering: {
      date: press.date,
      pressed: step % 2 === 1 ? press.shift : undefined,
    },
  };
}

// The hero's phone and entering's: an empty month, which the keys fill a
// day at a time as the page is scrolled.
export function EntryPhone() {
  const step = useStoryStep(entryAt, { drawn: BEFORE, still: entryStill });
  const { days, entering } = entryOf(step);
  const person = useSamplePerson({ schedule: {} });
  useEffect(() => {
    person.getState().setSchedule(days);
  }, [person, days]);
  return <PhoneScreen entering={entering} person={person} shown="whole" told />;
}

// The friends' shift table, as the top page shows it: the person's own
// column first, then a friend's with each step.
const friends = sampleOthers(oldFriendsGroup.id).length;
const friendsAt = (place: number) => stepOf(SCENES.friends, friends + 1, place);

export function FriendsPhone() {
  const joined = useStoryStep(friendsAt, { drawn: friends, still: friends });
  const person = useSamplePerson(featureScreens.share.own);
  return (
    <PhoneScreen
      {...featureScreens.share.opening}
      groupOthers={joined}
      person={person}
      shown="whole"
      told
    />
  );
}

// The coworkers' chat, as the top page shows it, a step at a time: each
// line arriving, the last of them the days put to the vote, then each
// person's votes on it.
const workChat = chatKey(workplaceGroup.id, groupChat);
const { messages } = sampleChats[workChat];
const voters = [
  ...new Set(
    messages.flatMap(({ content }) =>
      content.kind === "poll" ? Object.values(content.votes).flat() : []
    )
  ),
];
const votedBy = (count: number): Chat["messages"] =>
  messages.map((message) =>
    message.content.kind === "poll"
      ? {
          ...message,
          content: {
            ...message.content,
            votes: Object.fromEntries(
              Object.entries(message.content.votes).map(([day, people]) => [
                day,
                people.filter((id) => voters.indexOf(id) < count),
              ])
            ),
          },
        }
      : message
  );
const chatStages: Chat[] = [
  ...messages.map((_, index) => ({
    messages: votedBy(0).slice(0, index + 1),
    unread: 0,
  })),
  ...voters.map((_, index) => ({ messages: votedBy(index + 1), unread: 0 })),
];
const chatAt = (place: number) => stepOf(SCENES.chat, chatStages.length, place);
const chatEnd = chatStages.length - 1;

export function ChatPhone() {
  const stage = useStoryStep(chatAt, { drawn: chatEnd, still: chatEnd });
  const person = useSamplePerson(featureScreens.chat.own);
  useEffect(() => {
    person
      .getState()
      .setChats((chats) => ({ ...chats, [workChat]: chatStages[stage] }));
  }, [person, stage]);
  return (
    <PhoneScreen
      {...featureScreens.chat.opening}
      person={person}
      shown="whole"
      told
    />
  );
}

// The screens of the rest of what the stores say, after the story, each a
// still picture of the app's own screen that no code comes for: adding the
// month to the phone's calendar with 自動で反映 on and 繰り返し on a fixed
// order, as the top page shows them, and リマインド, which says when the
// evening before's notification comes.
const restScreens = {
  cares: {
    opening: { initialSettingsPage: "reminders", initialTab: "settings" },
    own: undefined,
  },
  details: featureScreens.repeat,
  "device-calendar": featureScreens.deviceCalendar,
} as const;

export function RestScreen({ shot }: { shot: keyof typeof restScreens }) {
  const { opening, own } = restScreens[shot];
  const person = useSamplePerson(own);
  return <PhoneScreen {...opening} person={person} shown="whole" />;
}
