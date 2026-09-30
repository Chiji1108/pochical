import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// /design/components is the shared pieces' spec: each one drawn as it
// is, with the SwiftUI and Compose piece it becomes (Item requires both).
// A piece added to the shared files without a place there fails here, so
// the page never falls behind the code.
const components = path.join(import.meta.dir, "../src/components");
const shared = ["design-ui.tsx", "design-sheet.tsx"];
const catalog = readFileSync(
  path.join(import.meta.dir, "../src/routes/design_.components.tsx"),
  "utf-8"
);

const exported = /^export function (?<name>[A-Z]\w*)/gmu;
const itemName = /\bname=(?:"(?<plain>[^"]+)"|\{`(?<template>[^`]+)`\})/gu;

const named = [...catalog.matchAll(itemName)]
  .map((match) => match.groups?.plain ?? match.groups?.template ?? "")
  .join(" ");

test("every shared piece is named on /design/components", () => {
  const missing = shared.flatMap((file) =>
    [...readFileSync(path.join(components, file), "utf-8").matchAll(exported)]
      .map((match) => match.groups?.name ?? "")
      .filter((name) => !new RegExp(`\\b${name}\\b`, "u").test(named))
      .map((name) => `${file} ${name}`)
  );
  expect(missing).toEqual([]);
});
