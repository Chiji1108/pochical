import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import { css } from "styled-system/css";

// Its types only: the code itself loads after the page shows (below).
import type * as LpScreens from "../components/lp-screens";
import { StoreLinks } from "../components/store-links";
import { pageMeta, site, WIDE } from "../lib/site";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => pageMeta("シフトを、ポチッと。", site.description, "/"),
  // The server draws the screens into the page itself, so it has their
  // code before it draws; a fresh server would otherwise send the page
  // without them. The browser takes them after (below).
  loader: async () => {
    if (import.meta.env.SSR) {
      await import("../components/lp-screens");
    }
  },
});

// What the app's own code draws, its sky and its phones, loads after the
// page's words first show; until then the server's drawing stands (React
// hydrates each once its code arrives). Keep the app out of this file's
// imports, or the page waits for all of it again: scripts/bundle-budget.ts
// checks.
type Screens = typeof LpScreens;
let loaded: Screens | undefined;
const screens = (async () => {
  const module = await import("../components/lp-screens");
  loaded = module;
  return module;
})();

// One of the screens: drawn at once where its code is already in, as on
// the server, and otherwise waiting for it (React keeps the server's
// drawing meanwhile).
function fromScreens<Props extends object>(
  pick: (module: Screens) => ComponentType<Props>
) {
  const Waiting = lazy(async () => ({ default: pick(await screens) }));
  return function Screen(props: Props) {
    const [ready] = useState(() => loaded);
    if (ready === undefined) {
      return <Waiting {...(props as ComponentProps<typeof Waiting>)} />;
    }
    const Ready = pick(ready);
    return <Ready {...props} />;
  };
}

const Sky = fromScreens((module) => module.Sky);
const HeroPhone = fromScreens((module) => module.HeroPhone);
const FeatureScreen = fromScreens((module) => module.FeatureScreen);
const ThemeGallery = fromScreens((module) => module.ThemeGallery);

// The site's muted gray, a step darker: over the sky it keeps above 5:1,
// where the site's own falls short of 4.5:1.
const ON_SKY_TEXT = "#5c6159";

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

// ポチッと。 is a button, though it keeps the heading's look: pressed, it
// sinks a little and springs back, and drifts the sky behind it. Nothing
// hints at it; it is there for whoever tries. The press itself is CSS, so
// it answers even before the app's code arrives.
const pressed = css({
  "&:active": {
    transform: "translateY(3px) scale(0.92)",
    transition: "transform 0.12s ease-in",
  },
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  WebkitTapHighlightColor: "transparent",
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
});

function Pressed({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <button className={pressed} onClick={onPress} type="button">
      {children}
    </button>
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
  title: css({
    fontSize: "clamp(26px, 3vw, 34px)",
    fontWeight: 700,
    letterSpacing: "0.01em",
    lineHeight: 1.5,
  }),
};

// The screens bring their own providers (lp-screens.tsx): none sit up
// here, where a change could reach a screen still waiting to hydrate.
function Features() {
  return (
    <ol aria-label="ポチカルでできること" className={feature.list}>
      {features.map((item) => (
        <li className={feature.row} key={item.id}>
          <div className={feature.copy}>
            <p className={feature.label}>{item.label}</p>
            <h2 className={feature.title}>{item.title}</h2>
            <p className={feature.body}>{item.body}</p>
          </div>
          <Suspense>{item.screen}</Suspense>
        </li>
      ))}
    </ol>
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
  }),
  icon: css({ borderRadius: "14px" }),
  release: css({ color: ON_SKY_TEXT, fontSize: "11px" }),
  root: css({
    [WIDE]: { padding: "120px 48px 160px" },
    display: "flex",
    isolation: "isolate",
    justifyContent: "center",
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
  const [presses, setPresses] = useState(0);
  return (
    <section aria-labelledby="closing-title" className={closing.root}>
      <Suspense>
        <Sky bare place="sides" presses={presses} />
      </Suspense>
      <div className={closing.content}>
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
              setPresses((count) => count + 1);
            }}
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

// The hero's words over its sky, which ポチッと。 changes. Its own
// component, so a press redraws only these and not the phones below,
// which WhenNear may still be holding as the server drew them.
function HeroCopy() {
  const [presses, setPresses] = useState(0);
  return (
    <div className={hero.copy}>
      <Suspense>
        <Sky place="top" presses={presses} />
      </Suspense>
      <p className={hero.eyebrow}>シフトカレンダー</p>
      <h1 className={hero.title}>
        シフトを、
        <br />
        <Pressed
          onPress={() => {
            setPresses((count) => count + 1);
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
        <p className={hero.release}>iPhone・Android 向けに、ただいま準備中。</p>
      </div>
    </div>
  );
}

function Home() {
  return (
    <main className={page} id="main">
      <section className={hero.root}>
        <HeroCopy />
        <div className={hero.demo}>
          <Suspense>
            <HeroPhone />
          </Suspense>
          <p className={hero.hint}>
            そのまま触れます。勤務を選んで、日付をポチッ。
            <br />
            左右にスワイプすると、月が変わります。
          </p>
        </div>
      </section>
      <Features />
      <Closing />
    </main>
  );
}
