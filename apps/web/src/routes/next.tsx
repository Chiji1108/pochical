import { createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
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

// The new top page, built here until it replaces /.
export const Route = createFileRoute("/next")({
  component: NextHome,
  head: () =>
    pageMeta("新しいトップページ（試作）", site.description, "/next", true),
});

// The current proposal for each open design choice, as on /try.
const variants = parseDesignVariants({});

// The app's own ポチカル sky (おたのしみ): pale light from both top corners
// and the middle, fading down into the paper.
const [skyLeft, skyMiddle, skyRight] = [100, 150, 225].map((hue) =>
  oklchToHex({ chroma: 0.04, hue, lightness: 0.95 })
);
const skyBackground = [
  `radial-gradient(60% 80% at 0% 0%, ${skyLeft} 0%, transparent 70%)`,
  `radial-gradient(60% 80% at 100% 0%, ${skyRight} 0%, transparent 70%)`,
  `radial-gradient(50% 70% at 50% 20%, ${skyMiddle} 0%, transparent 75%)`,
].join(", ");
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
  sky: css({
    height: "min(860px, 100vh)",
    inset: "0 0 auto",
    maskImage: "linear-gradient(to bottom, black 40%, transparent)",
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    zIndex: -1,
  }),
  skyLight: css({
    inset: "-10% -10% 0",
    position: "absolute",
    transformOrigin: "50% 0",
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

// The sky over the top of the page, breathing as slowly as the app's.
function Sky() {
  const still = useReducedMotion() ?? false;
  return (
    <div aria-hidden="true" className={hero.sky}>
      <motion.div
        animate={still ? undefined : { scale: 1.08, x: "2%" }}
        className={hero.skyLight}
        initial={{ scale: 1, x: "-2%" }}
        style={{ background: skyBackground }}
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
      <DesignProviders>
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
        家族や友だちのシフトを、日ごとに並べて。
        <br />
        みんなが休みの日は、ひと目でわかります。
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
        シフト表から日付を持って、チャットへ。
        <br />
        「この日どう？」が、そのまま話せます。
      </>
    ),
    id: "group",
    label: "GROUP",
    screen: <FeatureScreen groupPage="chat" tab="group" />,
    title: (
      <>
        グループで、
        <br />
        そのまま相談。
      </>
    ),
  },
  {
    body: (
      <>
        テーマは12種類。シフトの印も、
        <br />
        塗り、線、絵文字、文字から選べます。
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
// 墨 with outlined marks in its one tone, さくら with emoji, and letters
// with their names under them and days off left plain.
type GalleryLook = {
  id: string;
  preset: PresetId;
  style: ShiftMarkStyle;
  fill: boolean;
  monochrome: boolean;
  names: boolean;
  highlight: boolean;
};
const galleryLooks: GalleryLook[] = [
  {
    fill: false,
    highlight: true,
    id: "sumi",
    monochrome: true,
    names: false,
    preset: "sumi",
    style: "icon",
  },
  {
    fill: true,
    highlight: true,
    id: "sakura-emoji",
    monochrome: false,
    names: false,
    preset: "sakura",
    style: "emoji",
  },
  {
    fill: true,
    highlight: false,
    id: "letters",
    monochrome: false,
    names: true,
    preset: "pochical",
    style: "badge",
  },
];

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
            <OffHighlightContext
              value={{
                highlight: {
                  badge: look.highlight,
                  emoji: look.highlight,
                  icon: look.highlight,
                },
              }}
            >
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
    <DesignProviders>
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

function NextHome() {
  return (
    <main className={page} id="main">
      <Sky />
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
    </main>
  );
}
