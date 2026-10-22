import type { ColorScheme } from "@pochical/design/colors";
import { presets, themeRoles } from "@pochical/design/themes";

// The admin site in ポチカル's own テーマ, light or dark as the computer
// is: each color role as the CSS variable of its name, which
// @pochical/styled-system's tokens point at (colors.text.primary is
// var(--text-primary)), set on the page as the app sets them on a screen.
const pochical = presets.find((preset) => preset.id === "pochical");
if (pochical === undefined) {
  throw new Error("design/ has no ポチカル テーマ");
}

const rolesOf = (scheme: ColorScheme) =>
  Object.entries(themeRoles(pochical, scheme))
    .map(([name, value]) => `--${name}:${value};`)
    .join("");

/** The stylesheet that sets the colors, light and dark. */
export const themeCss = `:root{color-scheme:light dark;${rolesOf("light")}}@media (prefers-color-scheme: dark){:root{${rolesOf("dark")}}}`;
