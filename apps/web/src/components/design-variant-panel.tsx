import { css } from "styled-system/css";

import {
  designVariantKeys,
  designVariantOptions,
} from "../lib/design-variants";
import type { DesignVariants } from "../lib/design-variants";

// Beside the demo's phone, on a translucent ground; one choice under
// another on a phone, and kept in view where it fits on one line.
const panel = {
  choice: css({
    "&[aria-pressed=true]": {
      bg: "background.card",
      boxShadow: "0 1px 3px var(--shadow-medium)",
      color: "accent.default",
      fontWeight: 600,
    },
    bg: "transparent",
    border: 0,
    borderRadius: "10px",
    fontSize: "11px",
    minHeight: "32px",
    padding: "0 11px",
  }),
  choices: css({
    bg: "fill.tertiary",
    borderRadius: "12px",
    display: "flex",
    padding: "2px",
  }),
  decision: css({
    "@media (max-width: 760px)": { justifyContent: "space-between" },
    alignItems: "center",
    border: 0,
    display: "flex",
    gap: "8px",
    margin: 0,
    padding: 0,
  }),
  label: css({
    color: "text.tertiary",
    float: "left",
    fontSize: "11px",
    padding: 0,
  }),
  root: css({
    "@media (max-width: 760px)": { flexDirection: "column" },
    "@media (min-width: 1100px)": {
      position: "sticky",
      top: "12px",
      zIndex: 10,
    },
    alignItems: "center",
    backdropFilter: "blur(8px)",
    bg: "var(--ws-bg-translucent)",
    border: "1px solid token(colors.border.default)",
    borderRadius: "20px",
    display: "flex",
    flex: "0 1 420px",
    flexWrap: "wrap",
    gap: "10px 22px",
    justifyContent: "center",
    margin: 0,
    maxWidth: "1100px",
    padding: "12px 18px",
  }),
  title: css({
    color: "accent.focus",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.1em",
    margin: 0,
  }),
};

// 比べる案: each design decision still open, switched in place.
export function VariantPanel({
  variants,
  onChange,
}: {
  variants: DesignVariants;
  onChange: <K extends keyof DesignVariants>(
    key: K,
    value: DesignVariants[K]
  ) => void;
}) {
  return (
    <section aria-labelledby="design-variants-title" className={panel.root}>
      <h2 className={panel.title} id="design-variants-title">
        比べる案
      </h2>
      {designVariantKeys.map((key) => {
        const { label, choices } = designVariantOptions[key];
        return (
          <fieldset className={panel.decision} key={key}>
            <legend className={panel.label}>{label}</legend>
            <div className={panel.choices}>
              {choices.map(({ value, label: choiceLabel }) => (
                <button
                  aria-pressed={variants[key] === value}
                  className={panel.choice}
                  key={value}
                  onClick={() => {
                    onChange(key, value);
                  }}
                  type="button"
                >
                  {choiceLabel}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
