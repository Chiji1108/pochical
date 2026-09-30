import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { css } from "styled-system/css";

import {
  DesignCalendar,
  initialDesignSchedule,
} from "../components/design-calendar";
import { sampleGroups } from "../components/design-group";
import { DesignProviders } from "../components/design-providers";
import { paleSkyLights, themeSkyId } from "../components/design-surprise";
import {
  createUserStore,
  sampleCoworkers,
  UserStoreContext,
} from "../lib/design-user-store";
import { parseDesignVariants } from "../lib/design-variants";
import { pageMeta, SHARE_IMAGE } from "../lib/site";

export const Route = createFileRoute("/design_/share-image")({
  component: ShareImage,
  head: () =>
    pageMeta(
      "共有したときの画像",
      "リンクを共有したときに出る、ポチカルの画像",
      "/design/share-image",
      true
    ),
});

// The picture a link to the site shows where it is shared (og:image), which
// bun run image:share takes from /design/share-image into public/share.png:
// the top page's hero in one frame, its words on the app's ポチカル sky and
// the calendar's phone rising from the bottom edge.
const [skyLeft, skyMiddle, skyRight] =
  paleSkyLights(themeSkyId("pochical")) ?? [];

const styles = {
  brand: css({
    "& img": { borderRadius: "12px" },
    alignItems: "center",
    display: "flex",
    fontSize: "26px",
    fontWeight: 700,
    gap: "14px",
    letterSpacing: "0.04em",
  }),
  copy: css({
    display: "flex",
    flexDirection: "column",
    gap: "44px",
    paddingTop: "36px",
    zIndex: 1,
  }),
  // The top page's words over its sky, in the same gray.
  description: css({
    color: "#5c6159",
    fontSize: "24px",
    letterSpacing: "0.04em",
    lineHeight: 1.8,
  }),
  phone: css({
    flexShrink: 0,
    height: "560px",
    overflow: "hidden",
    pointerEvents: "none",
    width: "390px",
  }),
  // With the /design phone's frame colors, as the top page gives them.
  root: css({
    "--ws-bezel": "#333631",
    "--ws-bezel-edge": "#b9bdb6",
    "--ws-bezel-shadow": "#30392f35",
    "--ws-island": "#242724",
    alignItems: "flex-start",
    bg: "var(--paper)",
    color: "var(--ink)",
    display: "flex",
    justifyContent: "space-between",
    overflow: "hidden",
    padding: "70px 110px 0 100px",
    position: "relative",
  }),
  sky: css({
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  }),
  title: css({
    fontSize: "76px",
    fontWeight: 700,
    letterSpacing: "0.01em",
    lineHeight: 1.35,
    margin: 0,
  }),
};

const skyBackground = [
  `radial-gradient(30% 45% at 18% 42%, ${skyLeft} 0%, transparent 70%)`,
  `radial-gradient(30% 45% at 48% 38%, ${skyRight} 0%, transparent 70%)`,
  `radial-gradient(34% 50% at 32% 70%, ${skyMiddle} 0%, transparent 75%)`,
].join(", ");

// The current proposal for each open design choice, as on the top page.
const variants = parseDesignVariants({});

function ShareImage() {
  const [person] = useState(() =>
    createUserStore({
      coworkers: sampleCoworkers,
      groups: sampleGroups(),
      schedule: initialDesignSchedule(),
    })
  );
  return (
    <div
      className={styles.root}
      data-share-image
      style={{ height: SHARE_IMAGE.height, width: SHARE_IMAGE.width }}
    >
      <div
        aria-hidden="true"
        className={styles.sky}
        style={{ background: skyBackground }}
      />
      <div className={styles.copy}>
        <p className={styles.brand}>
          <img alt="" height={52} src="/icon.png" width={52} />
          ポチカル
        </p>
        <h1 className={styles.title}>
          シフトを、
          <br />
          ポチッと。
        </h1>
        <p className={styles.description}>
          家族や友だちと共有できる、シフトカレンダー。
        </p>
      </div>
      <div aria-hidden="true" className={styles.phone} inert>
        <DesignProviders fresh>
          <UserStoreContext value={person}>
            <DesignCalendar initialEditing={false} variants={variants} />
          </UserStoreContext>
        </DesignProviders>
      </div>
    </div>
  );
}
