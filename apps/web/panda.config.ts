import { defineConfig } from "@pandacss/dev";

// Panda CSS for the /design prototype's pieces. The colors stay the CSS
// variables that themeStyle() sets per theme, tone and light or dark, so
// the tokens here only name them; the values live in design-tokens.ts.
// The site's own styles sit in styles.css (layer site), below Panda's.
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
  // The design pages, /demo and /try (marked .design-page): the site's
  // header and footer give way to the phone, and buttons take the text
  // color and focus ring around them unless a piece sets its own.
  globalCss: {
    ".design-page :is(button, a):focus-visible": {
      outline: "3px solid var(--accent-line)",
      outlineOffset: "4px",
    },
    ".design-page button": { color: "inherit" },
    "body:has(.design-page) > :is(.site-header, .site-footer)": {
      display: "none",
    },
  },
  // The site and the prototype bring their own base styles.
  preflight: false,
  theme: {
    extend: {
      // A sheet rises from the bottom of the phone and sinks back; the
      // dimmed ground behind it fades.
      // iOS's text styles at their default size, which the native apps
      // take as .font(.body) and so on and grow with the reader's text
      // size; Compose maps each onto its type scale. Each sets a size, and
      // headline its weight; a piece may still set a weight of its own, as
      // iOS's emphasized styles do. What is drawn to a fixed size, like a
      // day in the month or a mark, keeps its own px instead.
      textStyles: {
        body: { value: { fontSize: "17px" } },
        callout: { value: { fontSize: "16px" } },
        caption: { value: { fontSize: "12px" } },
        caption2: { value: { fontSize: "11px" } },
        footnote: { value: { fontSize: "13px" } },
        headline: { value: { fontSize: "17px", fontWeight: 600 } },
        largeTitle: { value: { fontSize: "34px" } },
        subheadline: { value: { fontSize: "15px" } },
        title1: { value: { fontSize: "28px" } },
        title2: { value: { fontSize: "22px" } },
        title3: { value: { fontSize: "20px" } },
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        fadeOut: { from: { opacity: 1 }, to: { opacity: 0 } },
        // A message jumped to from a reply: ringed, then the ring fades.
        flash: {
          "0%, 40%": { boxShadow: "0 0 0 3px var(--accent-muted)" },
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
      },
      tokens: {
        colors: {
          accent: { value: "var(--accent)" },
          accentFill: { value: "var(--accent-fill)" },
          // Hovered and pressed: the accent laid over whatever is under, as
          // Material's state layers, rather than more colors for a theme to set.
          accentHover: {
            value: "color-mix(in srgb, var(--accent) 12%, transparent)",
          },
          accentPressed: {
            value: "color-mix(in srgb, var(--accent) 16%, transparent)",
          },
          accentLine: { value: "var(--accent-line)" },
          accentMuted: { value: "var(--accent-muted)" },
          accentSoft: { value: "var(--accent-soft)" },
          // The screen's own ground.
          background: { value: "var(--bg)" },
          border: { value: "var(--border)" },
          controlOff: { value: "var(--control-off)" },
          danger: { value: "var(--danger)" },
          fill: { value: "var(--fill)" },
          fill2: { value: "var(--fill-2)" },
          holiday: { value: "var(--holiday)" },
          onAccentFill: { value: "var(--on-accent-fill)" },
          raised: { value: "var(--raised)" },
          saturday: { value: "var(--saturday)" },
          separator: { value: "var(--separator)" },
          surface: { value: "var(--surface)" },
          text: { value: "var(--text)" },
          text2: { value: "var(--text-2)" },
          text3: { value: "var(--text-3)" },
          text4: { value: "var(--text-4)" },
          textDisabled: { value: "var(--text-disabled)" },
        },
        radii: {
          // Buttons and cards.
          control: { value: "16px" },
          // Lists of rows, as iOS 26's grouped lists.
          list: { value: "24px" },
          // Small actions like icon buttons.
          action: { value: "12px" },
        },
        sizes: {
          // A button's height, and a smaller action's.
          control: { value: "52px" },
          action: { value: "40px" },
          touch: { value: "44px" },
        },
      },
    },
  },
});
