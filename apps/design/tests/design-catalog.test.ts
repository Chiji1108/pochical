import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The pages under /design/components are the shared pieces' spec: each
// one drawn as it is, with the SwiftUI and Compose piece it becomes (Item
// requires both). A piece added to the shared files without a place there
// fails here, so the pages never fall behind the code.
const components = path.join(
  import.meta.dir,
  "../../../packages/prototype/src/components"
);
const shared = [
  "design-ui.tsx",
  "design-fields.tsx",
  "design-header.tsx",
  "design-list.tsx",
  "design-choices.tsx",
  "design-menu.tsx",
  "design-sortable-list.tsx",
  "design-day-grid.tsx",
  "design-pager.tsx",
  "design-sheet.tsx",
];

// The groups of pieces, a file for each page (src/components/inventory),
// and the pages that place them (content/design/components).
const inventory = path.join(import.meta.dir, "../src/components/inventory");
const pages = path.join(import.meta.dir, "../content/design/components");
const readAll = (folder: string, extension: string) =>
  readdirSync(folder)
    .filter((file) => file.endsWith(extension))
    .map((file) => ({
      file,
      source: readFileSync(path.join(folder, file), "utf-8"),
    }));
const groups = readAll(inventory, ".tsx").filter(
  ({ file }) => file !== "item.tsx"
);
const placed = readAll(pages, ".mdx")
  .map(({ source }) => source)
  .join("\n");

const exported = /^export function (?<name>[A-Z]\w*)/gmu;
const itemName = /\bname=(?:"(?<plain>[^"]+)"|\{`(?<template>[^`]+)`\})/gu;

const named = groups
  .flatMap(({ source }) => [...source.matchAll(itemName)])
  .map((match) => match.groups?.plain ?? match.groups?.template ?? "")
  .join(" ");

test("every shared piece is named under /design/components", () => {
  const missing = shared.flatMap((file) =>
    [...readFileSync(path.join(components, file), "utf-8").matchAll(exported)]
      .map((match) => match.groups?.name ?? "")
      .filter((name) => !new RegExp(`\\b${name}\\b`, "u").test(named))
      .map((name) => `${file} ${name}`)
  );
  expect(missing).toEqual([]);
});

// A group left out of every page is a piece missing from the pages.
test("every group of pieces is placed on a page under /design/components", () => {
  const unplaced = groups.flatMap(({ file, source }) =>
    [...source.matchAll(exported)]
      .map((match) => match.groups?.name ?? "")
      .filter((name) => !placed.includes(`<${name} />`))
      .map((name) => `${file} ${name}`)
  );
  expect(unplaced).toEqual([]);
});
