import { rotationTemplates } from "@pochical/design/patterns";
import { themeSkyId } from "@pochical/design/skies";
import { DesignApp } from "@pochical/prototype/components/design-app";
import {
  DesignProviders,
  PresetContexts,
} from "@pochical/prototype/components/design-providers";
import {
  nextSkyId,
  paleSkyFromTop,
  paleSkyLights,
  SkyLight,
} from "@pochical/prototype/components/design-surprise";
import { ColorSchemeContext } from "@pochical/prototype/components/design-theme";
import type { PresetId } from "@pochical/prototype/components/design-theme";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  noOffLooks,
  OffLooksContext,
  ShiftMarkStyleContext,
} from "@pochical/prototype/components/shift-mark";
import type {
  OffLooks,
  ShiftMarkStyle,
} from "@pochical/prototype/components/shift-mark";
import { initialDesignSchedule } from "@pochical/prototype/lib/design-days";
import { presetList } from "@pochical/prototype/lib/design-patterns";
import { useSamplePerson } from "@pochical/prototype/lib/design-sample-person";
import { UserStoreContext } from "@pochical/prototype/lib/design-user-store";
import type { OwnData } from "@pochical/prototype/lib/design-user-store";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import { css, cva } from "@pochical/styled-system/css";
import { AnimatePresence, MotionConfig } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import type { ComponentProps, ReactNode } from "react";

import { pressesOf, subscribe } from "../lib/presses";
import type { SkyPlace } from "../lib/presses";

// The top page's pieces drawn by the app's own code: its sky, the hero's
// phone and the features' screens, each an island of pages/index.astro.
// The build draws them into the page, which shows that drawing until
// their code arrives; the page's words never wait for it. Movement
// follows the device's 視差効果を減らす setting.
function Motion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

// The current proposal for each open design choice, as on the catalog's
// /try (apps/catalog).
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
        // At the page's top, under the header too: nothing above it is
        // positioned, so it sits on the page's own ground. It rises from
        // the paper at the very top, where Safari's bar keeps the paper's
        // color, and fades back into it before the phone below.
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
    subscribe,
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

// The hero's month is entered up to the 19th: its first weeks show the
// look, and its last two are left to fill in, from the 20th.
const HERO_FIRST_BLANK = 20;
const heroSchedule = Object.fromEntries(
  Object.entries(initialDesignSchedule()).filter(
    ([key]) => Number(key.slice(-2)) < HERO_FIRST_BLANK
  )
);

// The app itself, the same one the catalog's /try runs, to tap right on
// the page.
export function HeroPhone() {
  const person = useSamplePerson({ schedule: heroSchedule });
  return (
    <Motion>
      <DesignProviders fresh>
        <UserStoreContext value={person}>
          <DesignApp
            initialDay={HERO_FIRST_BLANK}
            initialEditing
            variants={variants}
          />
        </UserStoreContext>
      </DesignProviders>
    </Motion>
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

// Where each feature's screen opens, a tab and its page, and what the
// sample person holds for it beyond the demo's.
type AppProps = ComponentProps<typeof DesignApp>;
type FeatureOpening =
  | (Required<Pick<AppProps, "initialTab" | "initialGroupPage">> & {
      initialTab: "group";
    })
  | (Required<Pick<AppProps, "initialTab" | "initialSettingsPage">> & {
      initialTab: "settings";
    });

type Feature = "repeat" | "share" | "chat";

// 繰り返し is for work that comes round in a fixed order, so the top page
// shows the order はじめの設定 offers for it: 当番・非番・休み.
const duty = rotationTemplates.find((template) => template.id === "duty");
if (duty?.sequence === undefined) {
  throw new Error("はじめの設定 has no 当番・非番・休み order");
}

const featureScreens: Record<
  Feature,
  { opening: FeatureOpening; own?: Partial<OwnData> }
> = {
  chat: { opening: { initialGroupPage: "chat", initialTab: "group" } },
  repeat: {
    opening: { initialSettingsPage: "repeat-new", initialTab: "settings" },
    own: {
      patterns: presetList(duty.patternKeys),
      rules: [{ sequence: duty.sequence, start: new Date(2026, 3, 1) }],
      schedule: {},
    },
  },
  share: { opening: { initialGroupPage: "shifts", initialTab: "group" } },
};

export function FeatureScreen({ feature }: { feature: Feature }) {
  const { opening, own } = featureScreens[feature];
  const person = useSamplePerson(own);
  return (
    <Motion>
      <div aria-hidden="true" className={screenStyle} inert>
        <DesignProviders fresh>
          <UserStoreContext value={person}>
            <DesignApp
              initialEditing={false}
              {...opening}
              variants={variants}
            />
          </UserStoreContext>
        </DesignProviders>
      </div>
    </Motion>
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
    _wide: { "--gallery-drop": "48px", "--gallery-scale": "0.6" },
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
    <div
      aria-hidden="true"
      className={gallery.root}
      inert
      style={{ "--gallery-last": phones.length - 1 }}
    >
      <DesignProviders fresh>
        {phones.map(({ key, screen }, index) => (
          <div className={gallery.phone} key={key} style={{ "--index": index }}>
            <div className={gallery.inner}>{screen}</div>
          </div>
        ))}
      </DesignProviders>
    </div>
  );
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

const plainDaysOff: OffLooks = { off: "mark", offs: noOffLooks };

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
            <OffLooksContext value={plainDaysOff}>
              <MonochromeContext value={{ monochrome: look.monochrome }}>
                {children}
              </MonochromeContext>
            </OffLooksContext>
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
    <Motion>
      <UserStoreContext value={person}>
        <PhoneGallery
          phones={galleryLooks.map((look) => ({
            key: look.id,
            screen: (
              <LookContexts look={look}>
                <DesignApp initialEditing={false} variants={variants} />
              </LookContexts>
            ),
          }))}
        />
      </UserStoreContext>
    </Motion>
  );
}
