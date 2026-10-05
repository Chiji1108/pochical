import { isValidElement } from "react";

// The weights shift marks are drawn in: duotone when filled, regular when
// not (IconWeight in shift-mark.tsx).
export const markIconWeights = ["duotone", "regular"] as const;

export type MarkIconPath = { d: string; opacity?: number };

// The package's exports hide each icon's drawings, so they are read from
// its files beside the entry point.
const PACKAGE = import.meta.resolve("@phosphor-icons/react");

function pathOf(node: unknown, where: string): MarkIconPath {
  if (
    !(isValidElement<Record<string, unknown>>(node) && node.type === "path")
  ) {
    throw new Error(`${where} draws something other than paths`);
  }
  const { d, opacity } = node.props;
  if (typeof d !== "string") {
    throw new TypeError(`${where} has a path without d`);
  }
  return opacity === undefined ? { d } : { d, opacity: Number(opacity) };
}

// One Phosphor icon's paths in each of markIconWeights, read from the
// package's own drawings.
export async function readPhosphorPaths(name: string) {
  const loaded: unknown = await import(
    new URL(`defs/${name}.es.js`, PACKAGE).href
  );
  const weights =
    typeof loaded === "object" && loaded !== null && "default" in loaded
      ? loaded.default
      : undefined;
  if (!(weights instanceof Map)) {
    throw new Error(`Phosphor has no drawings for ${name}`);
  }
  const paths: Record<string, MarkIconPath[]> = {};
  for (const weight of markIconWeights) {
    const drawing: unknown = weights.get(weight);
    if (!isValidElement<{ children?: unknown }>(drawing)) {
      throw new Error(`Phosphor's ${name} has no ${weight} weight`);
    }
    paths[weight] = [drawing.props.children]
      .flat()
      .map((child) => pathOf(child, `Phosphor's ${name} ${weight}`));
  }
  return paths;
}
