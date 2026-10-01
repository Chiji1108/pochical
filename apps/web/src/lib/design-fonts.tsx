import { fonts } from "@pochical/design/type";
import type { FontId } from "@pochical/design/type";
import { createContext, useContext } from "react";
import { token } from "styled-system/tokens";

// The フォント (design/src/type.ts) as CSS: each face before the system's,
// or before a mincho the system has, for the moment before it loads.
const systemFont = token("fonts.system");
const minchoFallback = '"Hiragino Mincho ProN", "Yu Mincho", serif';

export function fontFamilyOf(id: FontId) {
  const { family } = fonts.find((font) => font.id === id) ?? fonts[0];
  if (family === null) {
    return systemFont;
  }
  return `"${family}", ${id === "mincho" ? minchoFallback : systemFont}`;
}

export const FontContext = createContext<FontId>("system");

// Google Fonts serves each face in pieces by the characters on the page,
// so only what is drawn downloads. Its stylesheet goes into the head
// (React hoists it there, once) only where a face other than the
// system's shows.
const webFonts = `https://fonts.googleapis.com/css2?${fonts
  .filter((font) => font.family !== null)
  .map(
    (font) =>
      `family=${font.family?.replaceAll(" ", "+")}:wght@${font.weights.join(";")}`
  )
  .join("&")}&display=swap`;

export function WebFonts() {
  return <link href={webFonts} precedence="fonts" rel="stylesheet" />;
}

// The face of the person's screen.
export function useAppFont() {
  return fontFamilyOf(useContext(FontContext));
}
