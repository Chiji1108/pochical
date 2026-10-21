// Fails when the wire the iOS app takes Changes from (./wire.ts) changes
// while its sync schema (`Sync.schema`) stays (spec/sync-protocol.md,
// Change log and cursor). A device moves its cursor past what it cannot
// read, so an app that starts reading something new must raise the
// schema to take everything again.
//
//   bun tools/sync-schema/check.ts [--write]
//
// `--write` records the fingerprint, once Sync.schema is raised past the
// recorded one.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { wireFingerprint } from "./wire";

const root = path.join(import.meta.dir, "../..");
const SYNC_SWIFT =
  "apps/ios/Packages/PochicalKit/Sources/PochicalKit/Sync.swift";
const RECORD = "apps/ios/Packages/PochicalKit/sync-wire.json";

const fingerprint = wireFingerprint(path.join(root, "proto"));

const swift = await readFile(path.join(root, SYNC_SWIFT), "utf-8");
const declared = /static let schema(?:: Int)? = (?<n>\d+)/u.exec(swift)?.groups
  ?.n;
if (declared === undefined) {
  throw new Error(`${SYNC_SWIFT}: no \`static let schema = <n>\``);
}
const schema = Number(declared);

const parsed: unknown = JSON.parse(
  await readFile(path.join(root, RECORD), "utf-8")
);
if (
  typeof parsed !== "object" ||
  parsed === null ||
  !("schema" in parsed && typeof parsed.schema === "number") ||
  !("fingerprint" in parsed && typeof parsed.fingerprint === "string")
) {
  throw new Error(`${RECORD}: not { "fingerprint": string, "schema": number }`);
}
const recorded = { fingerprint: parsed.fingerprint, schema: parsed.schema };

if (schema === recorded.schema && fingerprint === recorded.fingerprint) {
  process.exit(0);
}
if (schema === recorded.schema) {
  console.error(
    `pochical.v1.Change, or a message or enum it holds, changed since Sync.schema ${schema} was recorded. ` +
      `Raise \`Sync.schema\` in ${SYNC_SWIFT} to ${schema + 1}, so devices take everything again ` +
      "and read it as the app now does (spec/sync-protocol.md), then run `mise run sync:check -- --write`."
  );
  process.exit(1);
}
if (schema < recorded.schema) {
  console.error(
    `Sync.schema is ${schema}, below the recorded ${recorded.schema}; it only goes up.`
  );
  process.exit(1);
}
if (process.argv.includes("--write")) {
  await writeFile(
    path.join(root, RECORD),
    `${JSON.stringify({ fingerprint, schema }, null, 2)}\n`
  );
  process.exit(0);
}
console.error(
  `Sync.schema is ${schema} and ${RECORD} records ${recorded.schema}: run \`mise run sync:check -- --write\`.`
);
process.exit(1);
