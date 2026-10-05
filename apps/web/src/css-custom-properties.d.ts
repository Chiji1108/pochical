// CSS custom properties (--name) in a style prop, which React sets as
// they are; without this, React's types know only CSS's own properties.
import "react";

declare module "react" {
  type CSSProperties = Record<`--${string}`, string | number | undefined>;
}
