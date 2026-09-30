import { createFileRoute } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { css } from "styled-system/css";

import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import { sampleGroups } from "../components/design-group";
import { DesignProviders } from "../components/design-providers";
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
    // The /design phone's frame colors, as the workspace gives them.
    "--ws-bezel": "#333631",
    "--ws-bezel-edge": "#b9bdb6",
    "--ws-bezel-shadow": "#30392f35",
    "--ws-island": "#242724",
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

// The app itself, the same one /try runs, to tap right on the page.
function HeroDemo() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: initialDesignSchedule(),
    })
  );
  return (
    <div className={hero.demo}>
      <DesignProviders>
        <UserStoreContext value={person}>
          <DesignCalendar initialEditing variants={variants} />
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

function NextHome() {
  return (
    <main id="main">
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
    </main>
  );
}
