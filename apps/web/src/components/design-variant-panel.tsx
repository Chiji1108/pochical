import {
  designVariantKeys,
  designVariantOptions,
} from "../lib/design-variants";
import type { DesignVariants } from "../lib/design-variants";

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
    <section
      aria-labelledby="design-variants-title"
      className="design-variants"
    >
      <h2 id="design-variants-title">比べる案</h2>
      {designVariantKeys.map((key) => {
        const { label, choices } = designVariantOptions[key];
        return (
          <fieldset key={key}>
            <legend>{label}</legend>
            <div className="design-segment">
              {choices.map(({ value, label: choiceLabel }) => (
                <button
                  aria-pressed={variants[key] === value}
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
