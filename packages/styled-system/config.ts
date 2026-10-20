import { defineConfig } from "@pandacss/dev";
import { increasedContrast } from "@pochical/design/colors";
import { radii, shadows, sizes, stateLayers } from "@pochical/design/metrics";
import { colorRoleNames } from "@pochical/design/themes";
import { textStyles } from "@pochical/design/type";

// Panda CSS for the prototype's pieces (@pochical/prototype), shared by
// every app that shows them. The colors stay the CSS variables that
// themeStyle() sets per テーマ and light or dark, so the tokens here only
// name them; the values, and the text styles and sizes, come from design/,
// which the native apps are generated from too. A site's own styles sit in
// its styles.css (layer site), below Panda's.
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

// With prefers-contrast: more, the quieter roles take a stronger one's
// color (design/src/colors.ts, increasedContrast), as the native apps draw
// them with Increase Contrast. Set under each themed element, whose own
// inline variables would win over a rule on itself.
const contrastedRoles = Object.fromEntries(
  Object.entries(increasedContrast).map(([name, stronger]) => [
    `--${name}`,
    `var(--${stronger})`,
  ])
);

const stateLayer = (opacity: number) =>
  `color-mix(in srgb, var(--accent-default) ${Math.round(opacity * PERCENT)}%, transparent)`;

export const config = defineConfig({
  importMap: "@pochical/styled-system",
  jsxFramework: "react",
  // The token variables point at the theme's, which themeStyle() sets on
  // each phone and preview, not on the page: declared again wherever a
  // theme is set, they resolve against that theme rather than the page's.
  cssVarRoot: ':where(:root, [style*="--accent"])',
  // Hover only where there is a pointer to hover with: on a touch screen
  // the last button tapped would otherwise keep its hover color.
  conditions: {
    extend: {
      hover: ["@media (hover: hover)", "&:is(:hover, [data-hover])"],
      // Where the top page sets its words and phones side by side. A
      // condition, not a shared constant: Panda reads styles before the
      // code runs, so it cannot follow a key imported from another file.
      wide: "@media (min-width: 960px)",
    },
  },
  // The catalog's pages (marked .design-page), and the phone wherever it is
  // shown, as on the site's top page (.dc-phone): buttons take the text
  // color and focus ring around them unless a piece sets its own.
  globalCss: {
    ":is(.design-page, .dc-phone) :is(button, a):focus-visible": {
      outline: "3px solid var(--accent-focus)",
      outlineOffset: "4px",
    },
    ":is(.design-page, .dc-phone) button": { color: "inherit" },
    "@media (prefers-contrast: more)": {
      ':where(:root, [style*="--accent"]) > *': contrastedRoles,
    },
  },
  // The apps bring their own base styles (base.css).
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
        // The same along a bubble's outline, as its ring.
        ringFlash: { "0%, 40%": { opacity: 1 }, "100%": { opacity: 0 } },
        popIn: {
          from: { opacity: 0, transform: "scale(1.08)" },
          to: { opacity: 1, transform: "scale(1)" },
        },
        // A menu growing out of what opened it.
        growIn: {
          from: { opacity: 0, transform: "scale(0.6)" },
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
        // A photo still coming: its grey breathing, as a skeleton does.
        photoLoading: { "50%": { opacity: 0.4 } },
        // A photo's upload ring filling as the photo goes up.
        uploadRing: { to: { strokeDashoffset: 0 } },
        // A dot of someone typing: rising and brightening in turn, as
        // Messages draws it.
        typingDot: {
          "0%, 60%, 100%": { opacity: 0.35, transform: "translateY(0)" },
          "30%": { opacity: 1, transform: "translateY(-3px)" },
        },
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
        // Emoji marks and icons draw in the system's emoji font wherever
        // they sit.
        fonts: {
          emoji: { value: '"Apple Color Emoji", "Segoe UI Emoji", sans-serif' },
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

// What an app (apps/*) makes its CSS from: its own pieces and the
// prototype's it shows.
export const appConfig = defineConfig({
  ...config,
  include: [
    "./src/**/*.{ts,tsx}",
    "../../packages/prototype/src/**/*.{ts,tsx}",
  ],
});
