import { createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { css, cva } from "styled-system/css";

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
import { oklchToHex } from "../lib/oklch";
import { pageMeta, site } from "../lib/site";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => pageMeta("シフトを、ポチッと。", site.description, "/"),
});

// The current proposal for each open design choice, as on /try.
const variants = parseDesignVariants({});

// The app's own ポチカル sky (おたのしみ): pale light from both corners of
// one edge and the middle, fading into the paper. The page opens under it
// and closes over it.
const [skyLeft, skyMiddle, skyRight] = [100, 150, 225].map((hue) =>
  oklchToHex({ chroma: 0.04, hue, lightness: 0.95 })
);
type SkyEdge = "top" | "bottom";
const skyBackgrounds: Record<SkyEdge, string> = {
  bottom: [
    `radial-gradient(60% 80% at 0% 100%, ${skyLeft} 0%, transparent 70%)`,
    `radial-gradient(60% 80% at 100% 100%, ${skyRight} 0%, transparent 70%)`,
    `radial-gradient(50% 70% at 50% 80%, ${skyMiddle} 0%, transparent 75%)`,
  ].join(", "),
  top: [
    `radial-gradient(60% 80% at 0% 0%, ${skyLeft} 0%, transparent 70%)`,
    `radial-gradient(60% 80% at 100% 0%, ${skyRight} 0%, transparent 70%)`,
    `radial-gradient(50% 70% at 50% 20%, ${skyMiddle} 0%, transparent 75%)`,
  ].join(", "),
};
const BREATH_SECONDS = 9;

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
    maxWidth: "460px",
    textAlign: "center",
  }),
  demo: css({
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    width: "min(390px, 100%)",
  }),
  description: css({
    color: "var(--muted)",
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
  release: css({ color: "var(--muted)", fontSize: "11px" }),
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
    padding: "40px 16px 72px",
  }),
  // From the very top of the page, under the header too: nothing above it
  // is positioned, so it sits on the page's own ground.
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
  // At the page's top, under the header too: nothing above it is
  // positioned, so it sits on the page's own ground. At its end, in the
  // closing section, which keeps it behind its content.
  root: cva({
    base: {
      overflow: "hidden",
      pointerEvents: "none",
      position: "absolute",
      zIndex: -1,
    },
    variants: {
      edge: {
        // Fading out below too, into the paper before the footer.
        bottom: {
          inset: 0,
          maskImage:
            "linear-gradient(to top, transparent, black 25%, black 45%, transparent)",
        },
        top: {
          height: "min(860px, 100vh)",
          inset: "0 0 auto",
          maskImage: "linear-gradient(to bottom, black 40%, transparent)",
        },
      },
    },
  }),
  light: cva({
    base: { position: "absolute" },
    variants: {
      edge: {
        bottom: { inset: "0 -10% -10%", transformOrigin: "50% 100%" },
        top: { inset: "-10% -10% 0", transformOrigin: "50% 0" },
      },
    },
  }),
};

// The sky, breathing as slowly as the app's.
function Sky({ edge }: { edge: SkyEdge }) {
  const still = useReducedMotion() ?? false;
  return (
    <div aria-hidden="true" className={sky.root({ edge })}>
      <motion.div
        animate={still ? undefined : { scale: 1.08, x: "2%" }}
        className={sky.light({ edge })}
        initial={{ scale: 1, x: "-2%" }}
        style={{ background: skyBackgrounds[edge] }}
        transition={{
          duration: BREATH_SECONDS,
          ease: "easeInOut",
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "mirror",
        }}
      />
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

// The page's end: the store links again for those who read this far, over
// the sky the page opened under.
const closing = {
  icon: css({ borderRadius: "14px" }),
  release: css({ color: "var(--muted)", fontSize: "11px" }),
  root: css({
    [WIDE]: { padding: "120px 48px 160px" },
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    isolation: "isolate",
    padding: "96px 16px 120px",
    position: "relative",
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
  return (
    <section aria-labelledby="closing-title" className={closing.root}>
      <Sky edge="bottom" />
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
        ポチッと。
      </h2>
      <StoreLinks />
      <p className={closing.release}>
        iPhone・Android 向けに、ただいま準備中。
      </p>
    </section>
  );
}

function Home() {
  return (
    <main className={page} id="main">
      <Sky edge="top" />
      <section className={hero.root}>
        <div className={hero.copy}>
          <p className={hero.eyebrow}>シフトカレンダー</p>
          <h1 className={hero.title}>
            シフトを、
            <br />
            ポチッと。
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
