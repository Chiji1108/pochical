// Fails when the wire the apps take Changes from (./wire.ts) changes while
// an app's sync schema stays (spec/sync-protocol.md, Change log and
// cursor). A device moves its cursor past what it cannot read, so an app
// that starts reading something new must raise the schema to take
// everything again.
//
//   pnpm exec tsx tools/sync-schema/check.ts [--write]
//
// `--write` records the fingerprint for each app whose schema was raised
// past the recorded one.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { wireFingerprint } from "./wire";

const root = path.join(import.meta.dirname, "../..");

/** Where each app declares its sync schema, and where its check is recorded. */
const apps = [
  {
    declaration: /static let schema(?:: Int)? = (?<n>\d+)/u,
    name: "Sync.schema",
    record: "apps/ios/Packages/PochicalKit/sync-wire.json",
    source: "apps/ios/Packages/PochicalKit/Sources/PochicalKit/Sync.swift",
  },
  {
    declaration: /const val SYNC_SCHEMA = (?<n>\d+)/u,
    name: "SYNC_SCHEMA",
    record: "apps/android/kit/sync-wire.json",
    source: "apps/android/kit/src/main/kotlin/app/pochical/kit/Sync.kt",
  },
] as const;

const fingerprint = wireFingerprint(path.join(root, "proto"));
const writing = process.argv.includes("--write");

const readRecord = async (
  file: string
): Promise<{ fingerprint: string; schema: number }> => {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(root, file), "utf-8")
  );
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("schema" in parsed && typeof parsed.schema === "number") ||
    !("fingerprint" in parsed && typeof parsed.fingerprint === "string")
  ) {
    throw new Error(`${file}: not { "fingerprint": string, "schema": number }`);
  }
  return { fingerprint: parsed.fingerprint, schema: parsed.schema };
};

/** What is wrong with the app's schema, or nothing once it is recorded. */
const check = async (app: (typeof apps)[number]): Promise<string | null> => {
  const source = await readFile(path.join(root, app.source), "utf-8");
  const declared = app.declaration.exec(source)?.groups?.n;
  if (declared === undefined) {
    throw new Error(`${app.source}: no ${app.name} declared`);
  }
  const schema = Number(declared);
  const recorded = await readRecord(app.record);

  if (schema === recorded.schema && fingerprint === recorded.fingerprint) {
    return null;
  }
  if (schema === recorded.schema) {
    return (
      `pochical.v1.Change, or a message or enum it holds, changed since ${app.name} ${schema} was recorded. ` +
      `Raise ${app.name} in ${app.source} to ${schema + 1}, so devices take everything again ` +
      "and read it as the app now does (spec/sync-protocol.md), then run `mise run sync:check -- --write`."
    );
  }
  if (schema < recorded.schema) {
    return `${app.name} is ${schema}, below the recorded ${recorded.schema}; it only goes up.`;
  }
  if (writing) {
    await writeFile(
      path.join(root, app.record),
      `${JSON.stringify({ fingerprint, schema }, null, 2)}\n`
    );
    return null;
  }
  return `${app.name} is ${schema} and ${app.record} records ${recorded.schema}: run \`mise run sync:check -- --write\`.`;
};

const checked = await Promise.all(apps.map(check));
const problems = checked.filter((problem) => problem !== null);
for (const problem of problems) {
  console.error(problem);
}
process.exit(problems.length === 0 ? 0 : 1);
