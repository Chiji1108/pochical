import { createFileRoute } from "@tanstack/react-router";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { css } from "styled-system/css";

import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import type { Tab } from "../components/design-calendar";
import { sampleGroups } from "../components/design-group";
import {
  DesignProviders,
  PresetContexts,
} from "../components/design-providers";
import {
  BREATH_SECONDS,
  nextSkyId,
  paleSkyLights,
  SKY_CHANGE,
  themeSkyId,
} from "../components/design-surprise";
import { ColorSchemeContext } from "../components/design-theme";
import type { PresetId } from "../components/design-theme";
import {
  CellNamesContext,
  IconWeightContext,
  MonochromeContext,
  OffHighlightContext,
  ShiftMarkStyleContext,
} from "../components/shift-mark";
import type { ShiftMarkStyle } from "../components/shift-mark";
import { StoreLinks } from "../components/store-links";
import {
  createUserStore,
  sampleCoworkers,
  UserStoreContext,
} from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import { pageMeta, site } from "../lib/site";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => pageMeta("シフトを、ポチッと。", site.description, "/"),
});

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

// The site's muted gray, a step darker: over the sky it keeps above 5:1,
// where the site's own falls short of 4.5:1.
const ON_SKY_TEXT = "#5c6159";

// Where the copy and the phone stand side by side.
const WIDE = "@media (min-width: 960px)";

// The /design phone's frame colors, as the workspace gives them.
const page = css({
  "--ws-bezel": "#333631",
  "--ws-bezel-edge": "#b9bdb6",
  "--ws-bezel-shadow": "#30392f35",
  "--ws-island": "#242724",
});

const hero = {
  copy: css({
    [WIDE]: { paddingTop: "120px", textAlign: "left" },
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    isolation: "isolate",
    maxWidth: "460px",
    position: "relative",
    textAlign: "center",
  }),
  demo: css({
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    width: "min(390px, 100%)",
  }),
  description: css({
    color: ON_SKY_TEXT,
    fontSize: "15px",
    letterSpacing: "0.035em",
    lineHeight: 2.1,
  }),
  eyebrow: css({
    color: "var(--green)",
    fontSize: "11px",
    fontWeight: 650,
    letterSpacing: "0.17em",
  }),
  hint: css({
    color: "var(--muted)",
    fontSize: "12px",
    lineHeight: 1.9,
    textAlign: "center",
  }),
  release: css({ color: ON_SKY_TEXT, fontSize: "11px" }),
  root: css({
    [WIDE]: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: "96px",
      justifyContent: "center",
      padding: "24px 48px 96px",
    },
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "48px",
    // The sky behind the words reaches past the screen's sides.
    overflowX: "clip",
    padding: "40px 16px 72px",
  }),
  store: css({
    "& .store-links": { [WIDE]: { justifyContent: "flex-start" } },
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  }),
  title: css({
    fontSize: "clamp(38px, 5.2vw, 60px)",
    fontWeight: 700,
    letterSpacing: "0.01em",
    lineHeight: 1.4,
  }),
};

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
// as the app's does. None yet, until a press brings the first.
function Sky({ id }: { id: string | undefined }) {
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

// Pressed once, like a button, a moment after it first shows: sinking a
// little and springing back, then still. The hero's is a CSS animation, so
// it comes at the same moment however long the app takes to load; the
// closing's waits until it is scrolled to. Since it looks pressable, it
// presses too: down while held, springing back on release, with the same
// depth and spring as the animation. A button, though it keeps the
// heading's look.
const pressed = css({
  "&:active": {
    transform: "translateY(3px) scale(0.92)",
    transition: "transform 0.12s ease-in",
  },
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
    transition: "none",
  },
  // Not held after it ends, so a press can move it.
  "&[data-cue]": { animation: "press 0.42s 0.7s backwards" },
  bg: "transparent",
  border: 0,
  color: "inherit",
  display: "inline-block",
  font: "inherit",
  letterSpacing: "inherit",
  padding: 0,
  touchAction: "manipulation",
  transformOrigin: "50% 100%",
  transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
  userSelect: "none",
  WebkitTapHighlightColor: "transparent",
});

function Pressed({
  children,
  onPress,
  whenSeen = false,
}: {
  children: ReactNode;
  onPress: () => void;
  whenSeen?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const seen = useInView(ref, { amount: "all", once: true });
  const cue = !whenSeen || seen;
  return (
    <button
      className={pressed}
      data-cue={cue ? "" : undefined}
      onClick={onPress}
      ref={ref}
      type="button"
    >
      {children}
    </button>
  );
}

// The app itself, the same one /try runs, to tap right on the page.
function HeroDemo() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: heroSchedule,
    })
  );
  return (
    <div className={hero.demo}>
      <DesignProviders fresh>
        <UserStoreContext value={person}>
          <DesignCalendar
            initialDay={HERO_FIRST_BLANK}
            initialEditing
            variants={variants}
          />
        </UserStoreContext>
      </DesignProviders>
      <p className={hero.hint}>
        そのまま触れます。勤務を選んで、日付をポチッ。
        <br />
        左右にスワイプすると、月が変わります。
      </p>
    </div>
  );
}

// What else the app does, each beside its own screen: the real one, not
// touchable, so the page never drifts from the app.
const features: {
  id: string;
  label: string;
  title: ReactNode;
  body: ReactNode;
  screen: ReactNode;
}[] = [
  {
    body: (
      <>
        家族や友だちのシフトを、ひとつの表に。
        <br />
        みんなが休みの日も、すぐ見つかります。
      </>
    ),
    id: "share",
    label: "SHARE",
    screen: <FeatureScreen groupPage="shifts" tab="group" />,
    title: (
      <>
        「いつ休み？」が、
        <br />
        ひと目で。
      </>
    ),
  },
  {
    body: (
      <>
        シフト表の日付を、チャットに貼って。
        <br />
        休みを合わせる相談も、グループの中で。
      </>
    ),
    id: "chat",
    label: "CHAT",
    screen: <FeatureScreen groupPage="chat" tab="group" />,
    title: (
      <>
        「この日どう？」も、
        <br />
        その場で。
      </>
    ),
  },
  {
    body: (
      <>
        テーマは12種類。
        <br />
        シフトの印も、好きな見た目に。
      </>
    ),
    id: "style",
    label: "STYLE",
    screen: <ThemeGallery />,
    title: (
      <>
        見た目も、
        <br />
        自分らしく。
      </>
    ),
  },
];

// How much of a feature's phone shows, from its top.
const SCREEN_SHOWN = 600;

const feature = {
  body: css({
    color: "var(--muted)",
    fontSize: "14px",
    letterSpacing: "0.035em",
    lineHeight: 2.1,
  }),
  copy: css({
    [WIDE]: { textAlign: "left" },
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    maxWidth: "400px",
    textAlign: "center",
  }),
  label: css({
    color: "var(--green)",
    fontSize: "11px",
    fontWeight: 650,
    letterSpacing: "0.17em",
  }),
  list: css({
    [WIDE]: { gap: "140px", padding: "80px 48px 140px" },
    display: "flex",
    flexDirection: "column",
    gap: "96px",
    listStyle: "none",
    margin: "0 auto",
    maxWidth: "1080px",
    padding: "40px 16px 96px",
  }),
  row: css({
    [WIDE]: {
      "&:nth-child(even)": { flexDirection: "row-reverse" },
      flexDirection: "row",
      gap: "120px",
      justifyContent: "center",
    },
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "36px",
  }),
  // The phone at the hero's size, only its top shown, fading out: a
  // scaled one would throw off the lists that measure themselves.
  screen: css({
    flexShrink: 0,
    height: `${SCREEN_SHOWN}px`,
    maskImage: "linear-gradient(to bottom, black 70%, transparent)",
    overflow: "hidden",
    pointerEvents: "none",
    width: "min(390px, 100%)",
  }),
  title: css({
    fontSize: "clamp(26px, 3vw, 34px)",
    fontWeight: 700,
    letterSpacing: "0.01em",
    lineHeight: 1.5,
  }),
};

function FeatureScreen({
  tab,
  groupPage,
}: {
  tab: Tab;
  groupPage?: "shifts" | "chat";
}) {
  const person = useSamplePerson();
  return (
    <div aria-hidden="true" className={feature.screen} inert>
      <UserStoreContext value={person}>
        <DesignCalendar
          initialEditing={false}
          initialGroupPage={groupPage}
          initialTab={tab}
          variants={variants}
        />
      </UserStoreContext>
    </div>
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
    <div
      aria-hidden="true"
      className={gallery.root}
      inert
      style={{ "--gallery-last": phones.length - 1 } as CSSProperties}
    >
      {phones.map(({ key, screen }, index) => (
        <div
          className={gallery.phone}
          key={key}
          style={{ "--index": index } as CSSProperties}
        >
          <div className={gallery.inner}>{screen}</div>
        </div>
      ))}
    </div>
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

function ThemeGallery() {
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

function Features() {
  return (
    <DesignProviders fresh>
      <ol aria-label="ポチカルでできること" className={feature.list}>
        {features.map((item) => (
          <li className={feature.row} key={item.id}>
            <div className={feature.copy}>
              <p className={feature.label}>{item.label}</p>
              <h2 className={feature.title}>{item.title}</h2>
              <p className={feature.body}>{item.body}</p>
            </div>
            {item.screen}
          </li>
        ))}
      </ol>
    </DesignProviders>
  );
}

// The page's end: the store links again for those who read this far, on
// the plain paper. Its ポチッと。 presses like the hero's, and as in the
// app, where おたのしみ has no sky until the first tap, its first press
// brings one up behind it.
const closing = {
  content: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    isolation: "isolate",
    position: "relative",
  }),
  icon: css({ borderRadius: "14px" }),
  release: css({ color: ON_SKY_TEXT, fontSize: "11px" }),
  root: css({
    [WIDE]: { padding: "120px 48px 160px" },
    display: "flex",
    justifyContent: "center",
    // The sky reaches past the screen's sides.
    overflowX: "clip",
    padding: "96px 16px 120px",
    textAlign: "center",
  }),
  title: css({
    fontSize: "clamp(26px, 3vw, 34px)",
    fontWeight: 700,
    letterSpacing: "0.01em",
    lineHeight: 1.5,
  }),
};

function Closing() {
  const [skyId, setSkyId] = useState<string>();
  return (
    <section aria-labelledby="closing-title" className={closing.root}>
      <div className={closing.content}>
        <Sky id={skyId} />
        <img
          alt=""
          className={closing.icon}
          height={64}
          src="/icon.png"
          width={64}
        />
        <h2 className={closing.title} id="closing-title">
          今月のシフトから、
          <br />
          <Pressed
            onPress={() => {
              setSkyId((id) =>
                id === undefined ? HERO_SKY : nextSkyId(id, "pochical")
              );
            }}
            whenSeen
          >
            ポチッと。
          </Pressed>
        </h2>
        <StoreLinks />
        <p className={closing.release}>
          iPhone・Android 向けに、ただいま準備中。
        </p>
      </div>
    </section>
  );
}

function Home() {
  const [skyId, setSkyId] = useState(HERO_SKY);
  return (
    <main className={page} id="main">
      <section className={hero.root}>
        <div className={hero.copy}>
          <Sky id={skyId} />
          <p className={hero.eyebrow}>シフトカレンダー</p>
          <h1 className={hero.title}>
            シフトを、
            <br />
            <Pressed
              onPress={() => {
                setSkyId((id) => nextSkyId(id, "pochical"));
              }}
            >
              ポチッと。
            </Pressed>
          </h1>
          <p className={hero.description}>
            勤務を選んで、日付をポチポチ。
            <br />
            ひと月ぶんが、すぐ埋まります。
            <br />
            家族や友だちとも、そのまま共有。
          </p>
          <div className={hero.store}>
            <StoreLinks />
            <p className={hero.release}>
              iPhone・Android 向けに、ただいま準備中。
            </p>
          </div>
        </div>
        <HeroDemo />
      </section>
      <Features />
      <Closing />
    </main>
  );
}
