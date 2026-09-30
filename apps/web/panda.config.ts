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
          "0%, 40%": { boxShadow: "0 0 0 3px var(--accent-border)" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
        // The top page's ポチッと。, pressed once like a button.
        press: {
          "0%": { animationTimingFunction: "ease-in", transform: "none" },
          "100%": { transform: "none" },
          "30%": {
            animationTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: "translateY(3px) scale(0.92)",
          },
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
        // its label and fill levels (primary to quaternary). Each points at
        // a CSS variable that themeStyle() and design-tokens.ts set.
        colors: {
          accent: {
            border: { value: "var(--accent-border)" },
            container: { value: "var(--accent-container)" },
            default: { value: "var(--accent-default)" },
            fill: { value: "var(--accent-fill)" },
            focus: { value: "var(--accent-focus)" },
            // Hovered and pressed: the accent laid over whatever is under,
            // as Material's state layers, rather than more colors for a
            // theme to set.
            hover: {
              value:
                "color-mix(in srgb, var(--accent-default) 12%, transparent)",
            },
            onFill: { value: "var(--accent-on-fill)" },
            pressed: {
              value:
                "color-mix(in srgb, var(--accent-default) 16%, transparent)",
            },
          },
          background: {
            // The screen's own ground, a card's, and a sheet's.
            base: { value: "var(--background-base)" },
            card: { value: "var(--background-card)" },
            elevated: { value: "var(--background-elevated)" },
          },
          border: {
            default: { value: "var(--border-default)" },
            strong: { value: "var(--border-strong)" },
          },
          calendar: {
            holiday: { value: "var(--calendar-holiday)" },
            noteMarker: { value: "var(--calendar-note-marker)" },
            offTint: { value: "var(--calendar-off-tint)" },
            saturday: { value: "var(--calendar-saturday)" },
          },
          control: { knob: { value: "var(--control-knob)" } },
          danger: {
            default: { value: "var(--danger-default)" },
            fill: { value: "var(--danger-fill)" },
            onFill: { value: "var(--danger-on-fill)" },
          },
          fill: {
            primary: { value: "var(--fill-primary)" },
            quaternary: { value: "var(--fill-quaternary)" },
            secondary: { value: "var(--fill-secondary)" },
            tertiary: { value: "var(--fill-tertiary)" },
          },
          inverse: {
            background: { value: "var(--inverse-background)" },
            text: { value: "var(--inverse-text)" },
          },
          separator: { value: "var(--separator)" },
          text: {
            disabled: { value: "var(--text-disabled)" },
            primary: { value: "var(--text-primary)" },
            quaternary: { value: "var(--text-quaternary)" },
            secondary: { value: "var(--text-secondary)" },
            tertiary: { value: "var(--text-tertiary)" },
          },
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
