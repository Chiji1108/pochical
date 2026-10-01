// Writes the Phosphor icons that shift marks use, in the two weights they
// are drawn in (duotone when filled, regular when not), as plain path data.
// @phosphor-icons/react ships all six weights in every icon, which would
// put the four unused ones in every page that shows a calendar.
// Run again after adding an icon to markIcons (shift-mark.tsx): bun run icon:marks
import { writeFile } from "node:fs/promises";

import { markIconWeights, readPhosphorPaths } from "./phosphor-paths";

// Phosphor's names for the icons markIcons draws.
export const phosphorNames = [
  "Airplane",
  "Ambulance",
  "Baby",
  "Barbell",
  "Bed",
  "BookOpen",
  "Briefcase",
  "Buildings",
  "Bus",
  "CalendarCheck",
  "Car",
  "Cat",
  "Clock",
  "CloudMoon",
  "CloudSun",
  "Coffee",
  "Confetti",
  "Couch",
  "Dog",
  "Drop",
  "Fire",
  "Fish",
  "Flower",
  "FlowerLotus",
  "FlowerTulip",
  "HandHeart",
  "ForkKnife",
  "GraduationCap",
  "Heart",
  "Hospital",
  "House",
  "Laptop",
  "Leaf",
  "Moon",
  "MoonStars",
  "MusicNote",
  "Phone",
  "Scissors",
  "Shield",
  "ShoppingBag",
  "Siren",
  "Sparkle",
  "Star",
  "Storefront",
  "Stethoscope",
  "Sun",
  "SunHorizon",
  "Syringe",
  "Train",
  "TreePalm",
  "Truck",
  "Umbrella",
  "Users",
  "Waves",
  "Wrench",
] as const;

const OUTPUT = new URL("../src/lib/mark-icon-paths.ts", import.meta.url)
  .pathname;

if (import.meta.main) {
  const entries = await Promise.all(
    phosphorNames.map(
      async (name) =>
        `  ${name}: ${JSON.stringify(await readPhosphorPaths(name))},`
    )
  );
  await writeFile(
    OUTPUT,
    [
      "// Written by scripts/mark-icons.ts (bun run icon:marks); do not edit.",
      `// Phosphor's paths for the shift marks' icons, ${markIconWeights.join(" and ")}, on a 256 grid.`,
      "type MarkIconPath = { d: string; opacity?: number };",
      `export type MarkIconName = ${phosphorNames.map((name) => `"${name}"`).join(" | ")};`,
      "",
      `export const markIconPaths: Record<MarkIconName, Record<"${markIconWeights.join('" | "')}", MarkIconPath[]>> = {`,
      ...entries,
      "};",
      "",
    ].join("\n")
  );
}
