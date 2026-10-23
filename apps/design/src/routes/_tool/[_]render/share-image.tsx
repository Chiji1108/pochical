import { themeSkyId } from "@pochical/design/skies";
import storeIcon from "@pochical/prototype/assets/icon-192.png?url";
import siteIcon from "@pochical/prototype/assets/icon.png?url";
import { DesignApp } from "@pochical/prototype/components/design-app";
import { DesignProviders } from "@pochical/prototype/components/design-providers";
import { paleSkyFromTop } from "@pochical/prototype/components/design-surprise";
import { InviteShareImage } from "@pochical/prototype/components/invite-share-image";
import { SHARE_IMAGE } from "@pochical/prototype/lib/brand";
import { useSamplePerson } from "@pochical/prototype/lib/design-sample-person";
import { UserStoreContext } from "@pochical/prototype/lib/design-user-store";
import type { UserStore } from "@pochical/prototype/lib/design-user-store";
import { parseDesignVariants } from "@pochical/prototype/lib/design-variants";
import { css } from "@pochical/styled-system/css";
import { createFileRoute } from "@tanstack/react-router";

import { pageMeta } from "../../../lib/page-meta";

export const Route = createFileRoute("/_tool/_render/share-image")({
  component: ShareImage,
  head: () =>
    pageMeta(
      "共有したときの画像",
      "リンクを共有したときに出る、ポチカルの画像"
    ),
});

// The picture a link to the site shows where it is shared (og:image), which
// bun run image:share takes from /_render/share-image into @pochical/prototype's assets/share.png:
// the top page's hero in one frame, its words on the app's ポチカル sky and
// the calendar's phone rising from the bottom edge. Under it, an invitation
// link's picture for a sample group, which the site's Worker draws for each
// group (src/lib/invite-image.ts) in Noto Sans JP (KR and TC for what it
// lacks) and Twemoji.

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
  // The site's image, and an invitation's under it.
  page: css({ display: "flex", flexDirection: "column", gap: "40px" }),
  phone: css({
    flexShrink: 0,
    height: "560px",
    overflow: "hidden",
    pointerEvents: "none",
    width: "390px",
  }),
  root: css({
    alignItems: "flex-start",
    bg: "var(--paper)",
    color: "var(--ink)",
    display: "flex",
    justifyContent: "space-between",
    overflow: "hidden",
    padding: "70px 110px 0 100px",
    position: "relative",
  }),
  // The top page's sky as it falls at the same width, only not kept
  // clear at the very top, where the page leaves room for Safari's bar.
  sky: css({
    height: "800px",
    inset: "0 0 auto",
    maskImage: "linear-gradient(to bottom, black 40%, transparent)",
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

const skyBackground = paleSkyFromTop(themeSkyId("pochical"));

// The current proposal for each open design choice, as on the top page.
const variants = parseDesignVariants({});

const sampleInviteGroup = {
  mark: { color: 0, emoji: "🍉", icon: "", letter: "", photoId: "" },
  memberCount: 5,
  name: "いとこ会",
};

function ShareImage() {
  const person = useSamplePerson();
  return (
    <div className={styles.page}>
      <SiteShareImage person={person} />
      <InviteShareImage group={sampleInviteGroup} icon={storeIcon} />
    </div>
  );
}

function SiteShareImage({ person }: { person: UserStore }) {
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
          <img alt="" height={52} src={siteIcon} width={52} />
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
            <DesignApp initialEditing={false} variants={variants} />
          </UserStoreContext>
        </DesignProviders>
      </div>
    </div>
  );
}
