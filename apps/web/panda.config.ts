import { defineConfig } from "@pandacss/dev";

// Panda CSS for the /design prototype's pieces. The colors stay the CSS
// variables that themeStyle() sets per theme, tone and light or dark, so
// the tokens here only name them; the values live in design-tokens.ts.
// Older styles sit in design.css (layer legacy) and styles.css (layer
// site), both below Panda's layers, until each piece moves over.
export default defineConfig({
  exclude: [],
  include: ["./src/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outdir: "styled-system",
  // The token variables point at the theme's, which themeStyle() sets on
  // each phone and preview, not on the page: declared again wherever a
  // theme is set, they resolve against that theme rather than the page's.
  cssVarRoot: ':where(:root, [style*="--accent"])',
  // The site and the prototype bring their own base styles.
  preflight: false,
  theme: {
    extend: {
      // A sheet rises from the bottom of the phone and sinks back; the
      // dimmed ground behind it fades.
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
        sheetOut: {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(100%)" },
        },
      },
      tokens: {
        colors: {
          accent: { value: "var(--accent)" },
          accentFill: { value: "var(--accent-fill)" },
          accentLine: { value: "var(--accent-line)" },
          accentMuted: { value: "var(--accent-muted)" },
          accentSoft: { value: "var(--accent-soft)" },
          accentSoft2: { value: "var(--accent-soft-2)" },
          accentStrong: { value: "var(--accent-strong)" },
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
          textFaint: { value: "var(--text-faint)" },
        },
        radii: {
          // Buttons and cards.
          control: { value: "15px" },
          // Lists of rows.
          list: { value: "16px" },
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
