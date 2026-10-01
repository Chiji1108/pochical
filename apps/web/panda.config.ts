import { defineConfig } from "@pandacss/dev";
import { radii, shadows, sizes, stateLayers } from "@pochical/design/metrics";
import { colorRoleNames } from "@pochical/design/themes";
import { textStyles } from "@pochical/design/type";

// Panda CSS for the /design prototype's pieces. The colors stay the CSS
// variables that themeStyle() sets per テーマ and light or dark, so the
// tokens here only name them; the values, and the text styles and sizes,
// come from design/, which the native apps are generated from too.
// The site's own styles sit in styles.css (layer site), below Panda's.
const REGULAR = 400;
const PERCENT = 100;

type ColorTokens = Record<string, Record<string, { value: string }>>;

// Each color role as a token: its first word the kind, the rest the level.
const colorTokens: ColorTokens = {};
for (const name of colorRoleNames) {
  const [kind = name, ...level] = name.split("-");
  const token = { value: `var(--${name})` };
  if (level.length === 0) {
    Object.assign(colorTokens, { [kind]: token });
  } else {
    const key = level
      .map((word, index) =>
        index === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`
      )
      .join("");
    colorTokens[kind] = { ...colorTokens[kind], [key]: token };
  }
}

const stateLayer = (opacity: number) =>
  `color-mix(in srgb, var(--accent-default) ${Math.round(opacity * PERCENT)}%, transparent)`;

export default defineConfig({
  exclude: [],
  include: ["./src/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outdir: "styled-system",
  // The token variables point at the theme's, which themeStyle() sets on
  // each phone and preview, not on the page: declared again wherever a
  // theme is set, they resolve against that theme rather than the page's.
  cssVarRoot: ':where(:root, [style*="--accent"])',
  // Hover only where there is a pointer to hover with: on a touch screen
  // the last button tapped would otherwise keep its hover color.
  conditions: {
    extend: {
      hover: ["@media (hover: hover)", "&:is(:hover, [data-hover])"],
    },
  },
  // The design pages, /demo and /try (marked .design-page), and the phone
  // wherever it is shown, as on the top page (.dc-phone): buttons take the
  // text color and focus ring around them unless a piece sets its own. On
  // the design pages, the site's header and footer give way to the phone.
  globalCss: {
    ":is(.design-page, .dc-phone) :is(button, a):focus-visible": {
      outline: "3px solid var(--accent-focus)",
      outlineOffset: "4px",
    },
    ":is(.design-page, .dc-phone) button": { color: "inherit" },
    "body:has(.design-page) > :is(.site-header, .site-footer)": {
      display: "none",
    },
  },
  // The site and the prototype bring their own base styles.
  preflight: false,
  theme: {
    extend: {
      // iOS's text styles (design/src/type.ts): each sets a size, and
      // headline its weight.
      textStyles: Object.fromEntries(
        Object.entries(textStyles).map(([name, { size, weight }]) => [
          name,
          {
            value:
              weight === REGULAR
                ? { fontSize: `${size}px` }
                : { fontSize: `${size}px`, fontWeight: weight },
          },
        ])
      ),
      // A sheet rises from the bottom of the phone and sinks back; the
      // dimmed ground behind it fades.
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        fadeOut: { from: { opacity: 1 }, to: { opacity: 0 } },
        // A message jumped to from a reply: ringed, then the ring fades.
        flash: {
          "0%, 40%": { boxShadow: "0 0 0 3px var(--accent-border)" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
        popIn: {
          from: { opacity: 0, transform: "scale(1.08)" },
          to: { opacity: 1, transform: "scale(1)" },
        },
        sheetIn: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        // From wherever a swipe let go of the sheet, or from rest.
        sheetOut: { to: { transform: "translateY(100%)" } },
        // The dimming under it, from however far a swipe has faded it.
        scrimOut: { to: { opacity: 0 } },
        // A photo's upload ring filling as the photo goes up.
        uploadRing: { to: { strokeDashoffset: 0 } },
      },
      tokens: {
        // Colors by role, grouped by kind, their levels named as iOS names
        // its label and fill levels (primary to quaternary): each role of
        // design/ (text-secondary as text.secondary), pointing at the CSS
        // variable of its name that themeStyle() sets.
        colors: {
          ...colorTokens,
          accent: {
            ...colorTokens.accent,
            // Hovered and pressed: the accent laid over whatever is under
            // (design/src/metrics.ts).
            hover: { value: stateLayer(stateLayers.hover) },
            pressed: { value: stateLayer(stateLayers.pressed) },
          },
        },
        // The corners by size (design/src/metrics.ts), and a circle for
        // round avatars and dots.
        radii: {
          ...Object.fromEntries(
            Object.entries(radii).map(([name, radius]) => [
              name,
              { value: `${radius}px` },
            ])
          ),
          circle: { value: "50%" },
        },
        // Shadows by how far a piece floats (design/src/metrics.ts).
        shadows: Object.fromEntries(
          Object.entries(shadows).map(([name, { blur, color, y }]) => [
            name,
            { value: `0 ${y}px ${blur}px var(--${color})` },
          ])
        ),
        sizes: Object.fromEntries(
          Object.entries(sizes).map(([name, size]) => [
            name,
            { value: `${size}px` },
          ])
        ),
      },
    },
  },
});
