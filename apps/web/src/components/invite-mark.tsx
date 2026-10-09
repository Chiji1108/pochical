/* @jsxImportSource react */
// satori draws this too (src/lib/invite-image.ts): inline styles only.
import { markColors } from "@pochical/design/colors";
import { markIconGlyphs } from "@pochical/design/mark-icons";
import type { MarkIcon } from "@pochical/design/mark-icons";

import { MarkIconSvg } from "./shift-mark";

/** A group's mark as the server gives it (proto GroupMark). */
export type InviteGroupMark = {
  emoji: string;
  icon: string;
  letter: string;
  color: number;
};

const isMarkIcon = (name: string): name is MarkIcon =>
  Object.hasOwn(markIconGlyphs, name);

// A group's mark on the invitation's page and its share image, as the
// app's GroupIcon draws it in light: an emoji as it is, an icon or letters
// in its palette color on that color's tint.
export function InviteMark({
  mark,
  size,
}: {
  mark: InviteGroupMark;
  size: number;
}) {
  const { color, tint } = markColors[mark.color] ?? markColors[0];
  if (mark.icon !== "" && isMarkIcon(mark.icon)) {
    return (
      <div
        style={{
          alignItems: "center",
          background: tint,
          borderRadius: size * 0.28,
          display: "flex",
          height: size,
          justifyContent: "center",
          width: size,
        }}
      >
        <MarkIconSvg
          color={color}
          icon={mark.icon}
          size={size * 0.62}
          weight="duotone"
        />
      </div>
    );
  }
  if (mark.letter !== "") {
    return (
      <div
        style={{
          alignItems: "center",
          background: tint,
          borderRadius: size * 0.28,
          color,
          display: "flex",
          // Letters in the text's fonts, not the emoji's around them.
          fontFamily: '"Noto Sans JP", system-ui, sans-serif',
          fontSize: size * 0.5,
          fontWeight: 700,
          height: size,
          justifyContent: "center",
          width: size,
        }}
      >
        {mark.letter}
      </div>
    );
  }
  return mark.emoji === "" ? null : (
    <div style={{ display: "flex", fontSize: size * 0.6 }}>{mark.emoji}</div>
  );
}
