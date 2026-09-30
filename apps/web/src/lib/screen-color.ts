import type { ColorScheme } from "@pochical/design/colors";
import { presets, schemeIn, themeRoles } from "@pochical/design/themes";
import type { PresetId } from "@pochical/design/themes";

// The screen's own color in a テーマ, which the device's status bar and the
// home screen app's launch images take. It lives apart from
// components/design-theme.tsx so /try's head, which every page's script
// carries, reads it without bringing the prototype's screens along.
export function screenColor(id: PresetId, scheme: ColorScheme) {
  const preset = presets.find((each) => each.id === id) ?? presets[0];
  const color = themeRoles(preset, schemeIn(preset, scheme))["background-base"];
  if (color === undefined) {
    throw new Error(`No screen color for ${id} in ${scheme}`);
  }
  return color;
}
