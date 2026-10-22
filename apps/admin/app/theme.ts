import type { ColorScheme } from "@pochical/design/colors";
import { presets, themeVariables } from "@pochical/design/themes";

// The admin site in ポチカル's own テーマ, light or dark as the computer
// is: the color variables a screen reads (themeVariables), which
// @pochical/styled-system's tokens point at (colors.text.primary is
// var(--text-primary)), set on the page as the prototype sets them on a
// screen.
const pochical = presets.find((preset) => preset.id === "pochical");
if (pochical === undefined) {
  throw new Error("design/ has no ポチカル テーマ");
}

const variablesOf = (scheme: ColorScheme) =>
  Object.entries(themeVariables(pochical, scheme))
    .map(([name, value]) => `${name}:${value};`)
    .join("");

/** The stylesheet that sets the colors, light and dark. */
export const themeCss = `:root{color-scheme:light dark;${variablesOf("light")}}@media (prefers-color-scheme: dark){:root{${variablesOf("dark")}}}`;
