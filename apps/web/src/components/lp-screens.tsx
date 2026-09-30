import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { css } from "styled-system/css";

import { initialDesignSchedule } from "../lib/design-days";
import {
  createUserStore,
  sampleCoworkers,
  UserStoreContext,
} from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import { WIDE } from "../lib/site";
import { DesignCalendar } from "./design-calendar";
import { sampleGroups } from "./design-group-data";
import { DesignProviders, PresetContexts } from "./design-providers";
import {
  BREATH_SECONDS,
  nextSkyId,
  paleSkyLights,
  SKY_CHANGE,
  themeSkyId,
} from "./design-surprise";
import type { Tab } from "./design-tab-bar";
import { ColorSchemeContext } from "./design-theme";
import type { PresetId } from "./design-theme";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  OffHighlightContext,
  ShiftMarkStyleContext,
} from "./shift-mark";
import type { ShiftMarkStyle } from "./shift-mark";
import { WhenNear } from "./when-near";

// The top page's pieces drawn by the app's own code: its sky, the hero's
// phone and the features' screens. They load after the page first shows
// (routes/index.tsx takes them lazily), so its words need not wait for
// the app; until then the server's drawing of them stands.

// The current proposal for each open design choice, as on /try.
const variants = parseDesignVariants({});

// The app's own ポチカル sky (おたのしみ): its three pale lights, drawn as
// a soft glow that fades into the paper on every side, so it never meets
// the browser's bars. It sits behind the hero's words only, and as in the
// app, pressing ポチッと。 drifts it to another of the app's skies.
const HERO_SKY = themeSkyId("pochical");
function skyBackground(id: string) {
  const [left, middle, right] = paleSkyLights(id) ?? [];
  return [
    `radial-gradient(45% 55% at 25% 40%, ${left} 0%, transparent 70%)`,
    `radial-gradient(45% 55% at 75% 45%, ${right} 0%, transparent 70%)`,
    `radial-gradient(50% 60% at 50% 62%, ${middle} 0%, transparent 75%)`,
  ].join(", ");
}

const sky = {
  // A little beyond the hero's words, which keep it behind them, faded
  // out to nothing at its edges.
  root: css({
    inset: "-120px -140px",
    maskImage: "radial-gradient(closest-side, black 45%, transparent)",
    // The breathing light reaches past it; the page's width must not.
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    zIndex: -1,
  }),
  // One sky, fading in over the one before.
  layer: css({ inset: 0, position: "absolute" }),
  light: css({ inset: "-6%", position: "absolute" }),
};

// The sky, breathing as slowly as the app's, and giving way to the next
// as the app's does each time ポチッと。 is pressed (`presses` counts them).
// A bare one has none until the first press brings it.
export function Sky({
  presses,
  bare = false,
}: {
  presses: number;
  bare?: boolean;
}) {
  const [shown, setShown] = useState({
    id: bare ? undefined : HERO_SKY,
    presses,
  });
  if (shown.presses !== presses) {
    setShown({
      id: shown.id === undefined ? HERO_SKY : nextSkyId(shown.id, "pochical"),
      presses,
    });
  }
  const { id } = shown;
  const still = useReducedMotion() ?? false;
  return (
    <div aria-hidden="true" className={sky.root}>
      <AnimatePresence initial={false}>
        {id === undefined ? null : (
          <motion.div
            animate={{ opacity: 1 }}
            className={sky.layer}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key={id}
            transition={SKY_CHANGE}
          >
            <motion.div
              animate={still ? undefined : { scale: 1.08, x: "2%" }}
              className={sky.light}
              initial={{ scale: 1, x: "-2%" }}
              style={{ background: skyBackground(id) }}
              transition={{
                duration: BREATH_SECONDS,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "mirror",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// The hero's month is entered up to the 19th: its first weeks show the
// look, and its last two are left to fill in, from the 20th.
const HERO_FIRST_BLANK = 20;
const heroSchedule = Object.fromEntries(
  Object.entries(initialDesignSchedule()).filter(
    ([key]) => Number(key.slice(-2)) < HERO_FIRST_BLANK
  )
);

// The app itself, the same one /try runs, to tap right on the page.
export function HeroPhone() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: heroSchedule,
    })
  );
  return (
    <DesignProviders fresh>
      <UserStoreContext value={person}>
        <DesignCalendar
          initialDay={HERO_FIRST_BLANK}
          initialEditing
          variants={variants}
        />
      </UserStoreContext>
    </DesignProviders>
  );
}

// How much of a feature's phone shows, from its top.
const SCREEN_SHOWN = 600;

// The phone at the hero's size, only its top shown, fading out: a
// scaled one would throw off the lists that measure themselves.
const screenStyle = css({
  flexShrink: 0,
  height: `${SCREEN_SHOWN}px`,
  maskImage: "linear-gradient(to bottom, black 70%, transparent)",
  overflow: "hidden",
  pointerEvents: "none",
  width: "min(390px, 100%)",
});

export function FeatureScreen({
  tab,
  groupPage,
}: {
  tab: Tab;
  groupPage?: "shifts" | "chat";
}) {
  const person = useSamplePerson();
  return (
    <WhenNear aria-hidden="true" className={screenStyle} inert>
      <DesignProviders fresh>
        <UserStoreContext value={person}>
          <DesignCalendar
            initialEditing={false}
            initialGroupPage={groupPage}
            initialTab={tab}
            variants={variants}
          />
        </UserStoreContext>
      </DesignProviders>
    </WhenNear>
  );
}

// A few real screens drawn small, side by side, each stepping down and in
// front of the one before. Only screens that do not measure themselves
// scale well, like the calendar.
const gallery = {
  inner: css({
    left: 0,
    position: "absolute",
    top: 0,
    transform: "scale(var(--gallery-scale))",
    transformOrigin: "top left",
    width: "390px",
  }),
  phone: css({
    borderRadius: "calc(53px * var(--gallery-scale))",
    height: "calc(844px * var(--gallery-scale))",
    left: "calc(var(--index) * var(--gallery-step))",
    overflow: "hidden",
    position: "absolute",
    top: "calc(var(--index) * var(--gallery-drop))",
    width: "calc(390px * var(--gallery-scale))",
  }),
  root: css({
    "--gallery-drop": "36px",
    "--gallery-scale": "0.44",
    // `--gallery-last` is the last phone's index.
    "--gallery-step":
      "calc((min(100vw - 32px, 520px) - 390px * var(--gallery-scale)) / var(--gallery-last))",
    [WIDE]: { "--gallery-drop": "48px", "--gallery-scale": "0.6" },
    flexShrink: 0,
    height:
      "calc(844px * var(--gallery-scale) + var(--gallery-last) * var(--gallery-drop))",
    pointerEvents: "none",
    position: "relative",
    width:
      "calc(390px * var(--gallery-scale) + var(--gallery-last) * var(--gallery-step))",
  }),
};

function PhoneGallery({
  phones,
}: {
  phones: { key: string; screen: ReactNode }[];
}) {
  return (
    <WhenNear
      aria-hidden="true"
      className={gallery.root}
      inert
      style={{ "--gallery-last": phones.length - 1 } as CSSProperties}
    >
      <DesignProviders fresh>
        {phones.map(({ key, screen }, index) => (
          <div
            className={gallery.phone}
            key={key}
            style={{ "--index": index } as CSSProperties}
          >
            <div className={gallery.inner}>{screen}</div>
          </div>
        ))}
      </DesignProviders>
    </WhenNear>
  );
}

// The sample person, for a feature's screens to share.
function useSamplePerson() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: initialDesignSchedule(),
    })
  );
  return person;
}

// The calendar in a few looks, each set as someone might set theirs:
// 墨 with outlined marks in its one tone, さくら with emoji, and ソーダ
// with letters and their names under them; days off left plain in all
// three, so nothing competes with the marks.
type GalleryLook = {
  id: string;
  preset: PresetId;
  style: ShiftMarkStyle;
  fill: boolean;
  monochrome: boolean;
  names: boolean;
};
const galleryLooks: GalleryLook[] = [
  {
    fill: false,
    id: "sumi",
    monochrome: true,
    names: false,
    preset: "sumi",
    style: "icon",
  },
  {
    fill: true,
    id: "sakura-emoji",
    monochrome: false,
    names: false,
    preset: "sakura",
    style: "emoji",
  },
  {
    fill: true,
    id: "letters",
    monochrome: false,
    names: true,
    preset: "soda",
    style: "badge",
  },
];

const plainDaysOff = {
  highlight: { badge: false, emoji: false, icon: false },
};

function LookContexts({
  look,
  children,
}: {
  look: GalleryLook;
  children: ReactNode;
}) {
  const themed = (
    <PresetContexts id={look.preset}>
      <IconWeightContext value={look.fill ? "duotone" : "regular"}>
        <ShiftMarkStyleContext value={look.style}>
          <CellNamesContext
            value={{
              names: { badge: look.names, emoji: look.names, icon: look.names },
            }}
          >
            <OffHighlightContext value={plainDaysOff}>
              <MonochromeContext value={{ monochrome: look.monochrome }}>
                {children}
              </MonochromeContext>
            </OffHighlightContext>
          </CellNamesContext>
        </ShiftMarkStyleContext>
      </IconWeightContext>
    </PresetContexts>
  );
  return <ColorSchemeContext value="light">{themed}</ColorSchemeContext>;
}

export function ThemeGallery() {
  const person = useSamplePerson();
  return (
    <UserStoreContext value={person}>
      <PhoneGallery
        phones={galleryLooks.map((look) => ({
          key: look.id,
          screen: (
            <LookContexts look={look}>
              <DesignCalendar initialEditing={false} variants={variants} />
            </LookContexts>
          ),
        }))}
      />
    </UserStoreContext>
  );
}
