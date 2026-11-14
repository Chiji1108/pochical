import { themeSkyId } from "@pochical/design/skies";
import { DesignApp } from "@pochical/prototype/components/design-app";
import type { Entering } from "@pochical/prototype/components/design-calendar";
import { DesignProviders } from "@pochical/prototype/components/design-providers";
import {
  nextSkyId,
  paleSkyFromTop,
  paleSkyLights,
  SkyLight,
} from "@pochical/prototype/components/design-surprise";
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
import { designMonth, designToday } from "@pochical/prototype/lib/design-today";
import { UserStoreContext } from "@pochical/prototype/lib/design-user-store";
import type { UserStore } from "@pochical/prototype/lib/design-user-store";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import { css, cva } from "@pochical/styled-system/css";
import { AnimatePresence, MotionConfig } from "motion/react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ComponentProps, ReactNode } from "react";

import { pressesOf, subscribe as onPress } from "../lib/presses";
import type { SkyPlace } from "../lib/presses";
import {
  BEATS,
  moves,
  placeNow,
  SCENES,
  stepOf,
  subscribe as onPlace,
} from "../lib/story";

// The top page's pieces drawn by the app's own code: its sky, and the
// phones of its story (pages/index.astro), each an island. The build draws
// them into the page, which shows that drawing until their code arrives;
// the page's words never wait for it. Movement follows the device's
// 視差効果を減らす setting.
function Motion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

// The current proposal for each open design choice, as on apps/try.
const variants = parseDesignVariants({});

// The app's own ポチカル sky (おたのしみ), drawn as the app draws it: its
// three pale lights coming in from the screen's edges. At the page's top
// it falls from the top corners and the middle, as over the app's
// calendar; at its end it comes in from both sides. As in the app,
// pressing ポチッと。 drifts it to another of the app's skies.
const HERO_SKY = themeSkyId("pochical");
function skyBackground(id: string, place: SkyPlace) {
  if (place === "top") {
    return paleSkyFromTop(id);
  }
  const [left, middle, right] = paleSkyLights(id) ?? [];
  return [
    `radial-gradient(70% 70% at 0% 45%, ${left} 0%, transparent 70%)`,
    `radial-gradient(70% 70% at 100% 55%, ${right} 0%, transparent 70%)`,
    `radial-gradient(50% 50% at 50% 50%, ${middle} 0%, transparent 75%)`,
  ].join(", ");
}

const sky = {
  root: cva({
    base: {
      // The breathing light reaches past it; the page's width must not.
      overflow: "hidden",
      pointerEvents: "none",
      position: "absolute",
      zIndex: -1,
    },
    variants: {
      place: {
        // At the top of what holds it: the story's stage where the page
        // moves, which stays on screen, so the sky stays behind the story;
        // the page itself where it stands still, under the header too. It
        // rises from the paper at the very top, where Safari's bar keeps
        // the paper's color, and fades back into it lower down.
        top: {
          height: "min(860px, 100svh)",
          inset: "0 0 auto",
          maskImage:
            "linear-gradient(to bottom, transparent, black 96px, black 40%, transparent)",
        },
        // Across its section from side to side, fading out above and
        // below, so it never meets the phones or the footer in a line.
        sides: {
          inset: 0,
          maskImage:
            "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
        },
      },
    },
  }),
  // One sky, fading in over the one before.
  layer: css({ inset: 0, position: "absolute" }),
  light: css({ inset: "-6%", position: "absolute" }),
};

// The sky, breathing as slowly as the app's, and giving way to the next
// as the app's does each time its ポチッと。 is pressed (lib/presses.ts).
// A bare one has none until the first press brings it.
export function Sky({
  place,
  bare = false,
}: {
  place: SkyPlace;
  bare?: boolean;
}) {
  const presses = useSyncExternalStore(
    onPress,
    () => pressesOf(place),
    () => 0
  );
  // It starts as if never pressed: presses made while this code was still
  // on its way change it at once on arrival.
  const [shown, setShown] = useState({
    id: bare ? undefined : HERO_SKY,
    presses: 0,
  });
  if (shown.presses !== presses) {
    setShown({
      id: shown.id === undefined ? HERO_SKY : nextSkyId(shown.id, "pochical"),
      presses,
    });
  }
  const { id } = shown;
  return (
    <Motion>
      <div aria-hidden="true" className={sky.root({ place })}>
        <AnimatePresence initial={false}>
          {id === undefined ? null : (
            <SkyLight
              background={skyBackground(id, place)}
              className={sky.layer}
              key={id}
              lightClassName={sky.light}
            />
          )}
        </AnimatePresence>
      </div>
    </Motion>
  );
}

// A screen of someone's app in its phone, to look at and not to touch:
// how it opens, and whatever else the story sets. Its screen is changed
// by the page a step at a time (`data-told`), so what a step brings comes
// in over a moment (the prototype's design-told.ts).
const screen = css({
  display: "flex",
  flexShrink: 0,
  pointerEvents: "none",
  width: "min(390px, 100%)",
});

function PhoneScreen({
  person,
  ...app
}: { person: UserStore } & Partial<ComponentProps<typeof DesignApp>>) {
  return (
    <Motion>
      <div aria-hidden="true" className={screen} data-told="" inert>
        <DesignProviders fresh>
          <UserStoreContext value={person}>
            <DesignApp initialEditing={false} {...app} variants={variants} />
          </UserStoreContext>
        </DesignProviders>
      </div>
    </Motion>
  );
}

// The story's phones: the app's own screens, each showing as much of its
// part of the story as the page is scrolled through it. What a phone
// shows is worked out from the place alone, so scrolling back takes it
// back. The build draws each as `drawn`; where the page does not move
// with its scroll (lib/story.ts), each stands at `still`.
//
// A step that changes what the person holds (their days, a chat's lines)
// is written to their store, in the same turn the place's move is heard
// in, so the screen is drawn once for the step; a phone whose steps are
// all in the store is not drawn again for them itself.
function useStoryWrite(
  stepAt: (place: number) => number,
  still: number,
  write: (step: number) => void
) {
  useEffect(() => {
    let written: number | undefined;
    const sync = () => {
      const step = moves() ? stepAt(placeNow()) : still;
      if (step !== written) {
        written = step;
        write(step);
      }
    };
    sync();
    return onPlace(sync);
  }, [stepAt, still, write]);
}

// The step a phone is at, for what it is handed rather than holds.
function useStoryStep(
  stepAt: (place: number) => number,
  { drawn, still }: { drawn: number; still: number }
) {
  return useSyncExternalStore(
    onPlace,
    () => (moves() ? stepAt(placeNow()) : still),
    () => drawn
  );
}

// The sample month as ポチポチ入力's keys enter it: each press, the day it
// is made on, and the days as they were before it. 夜勤 fills the day after
// too, so the next press is a day further on.
const monthDays = daysOfMonth(designMonth);
const blank: Schedule = {};
function keyPressesOf(sample: Schedule) {
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
const { filled, presses } = keyPressesOf(initialDesignSchedule());

// The story opens on the month entered up to today, a week of it left:
// the presses from today on are the ones entering shows, and the days
// before the first of them the least the month ever holds.
const shown = presses.filter(
  ({ date }) => date.getDate() >= designToday.getDate()
);
const half = shown[0]?.before ?? filled;

// Entering's steps: the month before entering starts (BEFORE), then two
// for each press, the key going down and the day filled with the next
// day picked, and the month full at the end.
const BEFORE = -1;
const entrySteps = shown.length * 2 + 1;
const entryAt = (place: number) =>
  place < BEATS.entry.from ? BEFORE : stepOf(SCENES.entry, entrySteps, place);
// Standing still, the month is entered up to the 26th, the keys under it
// for the 27th, where its last row starts.
const STILL_FROM = 27;
const entryStill =
  shown.findIndex(({ date }) => date.getDate() >= STILL_FROM) * 2;

function entryOf(step: number): { days: Schedule; entering?: Entering } {
  if (step === BEFORE) {
    return { days: half };
  }
  const press = shown[Math.floor(step / 2)];
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

// The hero's phone and entering's: the month half entered, which the keys
// go on filling a day at a time as the page is scrolled. The build draws
// it half entered too.
const entryPlaces = { drawn: BEFORE, still: entryStill };

export function EntryPhone() {
  const person = useSamplePerson({ schedule: half });
  const write = useCallback(
    (step: number) => {
      person.getState().setSchedule(entryOf(step).days);
    },
    [person]
  );
  useStoryWrite(entryAt, entryStill, write);
  const step = useStoryStep(entryAt, entryPlaces);
  return <PhoneScreen entering={entryOf(step).entering} person={person} />;
}

// The friends' shift table, as the stores' picture has it: the person's
// own column first, then a friend's with each step.
const withFriends = { groups: [oldFriendsGroup] };
const friendsTable = {
  initialGroupId: oldFriendsGroup.id,
  initialGroupPage: "shifts",
  initialTab: "group",
} as const;
const friends = sampleOthers(oldFriendsGroup.id).length;
const friendsAt = (place: number) => stepOf(SCENES.friends, friends + 1, place);

export function FriendsPhone() {
  const joined = useStoryStep(friendsAt, { drawn: friends, still: friends });
  const person = useSamplePerson(withFriends);
  return <PhoneScreen {...friendsTable} groupOthers={joined} person={person} />;
}

// The coworkers' chat, as the stores' picture has it, a step at a time: each
// line arriving, the last of them the days put to the vote, then each
// person's votes on it.
const atWork = { groups: [workplaceGroup] };
const workChatPage = {
  initialGroupId: workplaceGroup.id,
  initialGroupPage: "chat",
  initialTab: "group",
} as const;
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
  const person = useSamplePerson(atWork);
  const write = useCallback(
    (stage: number) => {
      person
        .getState()
        .setChats((chats) => ({ ...chats, [workChat]: chatStages[stage] }));
    },
    [person]
  );
  useStoryWrite(chatAt, chatEnd, write);
  return <PhoneScreen {...workChatPage} person={person} />;
}
