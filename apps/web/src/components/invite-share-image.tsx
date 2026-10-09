/* @jsxImportSource react */
// satori breaks its own lines and draws no <wbr> (src/jsx).
import type { CSSProperties } from "react";

import { SHARE_IMAGE } from "../lib/site";
import { paleSkyFromTop, themeSkyId } from "./design-surprise";
import { InviteMark } from "./invite-mark";
import type { InviteGroupMark } from "./invite-mark";

// The picture an invitation link shows where it is shared (og:image): the
// group it invites to, under the same ポチカル sky as the site's own share
// image. The site's Worker draws it with satori (src/lib/invite-image.ts),
// so it is made of what satori draws: inline styles, flex boxes, and no
// classes. /design/share-image shows the same component in the page.

export type InviteImageGroup = {
  name: string;
  mark: InviteGroupMark;
  memberCount: number;
};

const INK = "#30332f";
const MUTED = "#5c6159";
const PAPER = "#fbfaf7";

const sky = paleSkyFromTop(themeSkyId("pochical"));

// A name up to groupName's 30 characters (spec/text-limits.md) in two
// lines at most: smaller as it grows, about 15, 17 and 20 to a line.
const nameSize = (name: string): number => {
  const { length } = [...name];
  if (length <= 15) {
    return 64;
  }
  return length <= 24 ? 56 : 48;
};

const styles = {
  brand: {
    alignItems: "center",
    display: "flex",
    fontSize: 26,
    fontWeight: 700,
    gap: 14,
    left: 100,
    letterSpacing: "0.04em",
    position: "absolute",
    top: 70,
  },
  // Positioned, so a browser paints it over the sky as satori does.
  group: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: 28,
    position: "relative",
  },
  icon: { borderRadius: 12, height: 52, width: 52 },
  // The group's mark in a soft frame, as the invite page and the app's
  // join screen hold it.
  mark: {
    alignItems: "center",
    background: "rgba(255, 255, 255, 0.72)",
    borderRadius: 44,
    display: "flex",
    fontSize: 92,
    height: 156,
    justifyContent: "center",
    width: 156,
  },
  name: {
    fontWeight: 700,
    letterSpacing: "0.01em",
    lineHeight: 1.3,
    maxWidth: 960,
    textAlign: "center",
  },
  note: { color: MUTED, fontSize: 26, letterSpacing: "0.04em" },
  root: {
    alignItems: "center",
    background: PAPER,
    color: INK,
    display: "flex",
    // The fonts the Worker draws in (src/lib/invite-image.ts); the page shows
    // them where they are installed.
    fontFamily: '"Noto Sans JP", "Noto Sans KR", "Noto Sans TC", sans-serif',
    height: SHARE_IMAGE.height,
    justifyContent: "center",
    paddingTop: 40,
    position: "relative",
    width: SHARE_IMAGE.width,
  },
  // The site's sky, falling from the top and fading before the bottom.
  sky: {
    backgroundImage: sky,
    height: 630,
    left: 0,
    position: "absolute",
    top: 0,
    width: 1200,
  },
} satisfies Record<string, CSSProperties>;

export function InviteShareImage({
  group,
  icon,
}: {
  group: InviteImageGroup;
  // The app icon's address: a data URL where satori draws it.
  icon: string;
}) {
  return (
    <div style={styles.root}>
      <div style={styles.sky} />
      <div style={styles.brand}>
        <img alt="" height={52} src={icon} style={styles.icon} width={52} />
        ポチカル
      </div>
      <div style={styles.group}>
        <div style={styles.mark}>
          <InviteMark mark={group.mark} size={124} />
        </div>
        <div style={{ ...styles.name, fontSize: nameSize(group.name) }}>
          {group.name}
        </div>
        <div style={styles.note}>
          {group.memberCount > 0
            ? `グループへの招待・メンバー ${group.memberCount}人`
            : "グループへの招待"}
        </div>
      </div>
    </div>
  );
}
