// Fails when the wire the iOS app takes Changes from changes while its
// sync schema (`Sync.schema`) stays (spec/sync-protocol.md, Change log
// and cursor). A device moves its cursor past what it cannot read, so an
// app that starts reading something new must raise the schema to take
// everything again.
//
//   bun tools/sync-schema/check.ts [--write]
//
// The wire is `pochical.v1.Change` and every message and enum it holds,
// by field number, type, label and oneof; field and value names are left
// out, as a rename changes nothing a device holds. The rest of proto/
// (edits, pages, Welcome, comments) does not count. `--write` records the
// fingerprint, once Sync.schema is raised past the recorded one.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { ScalarType } from "@bufbuild/protobuf";
import type { DescEnum, DescField, DescMessage } from "@bufbuild/protobuf";

import { ChangeSchema } from "../../apps/server/src/gen/pochical/v1/sync_pb";

const SYNC_SWIFT =
  "apps/ios/Packages/PochicalKit/Sources/PochicalKit/Sync.swift";
const RECORD = "apps/ios/Packages/PochicalKit/sync-wire.json";

const typeOf = (field: DescField): string =>
  field.message?.typeName ??
  field.enum?.typeName ??
  ScalarType[field.scalar ?? ScalarType.BYTES];

const describeField = (field: DescField): string => {
  if (field.fieldKind === "list") {
    return `${field.number} repeated ${typeOf(field)}`;
  }
  if (field.fieldKind === "map") {
    return `${field.number} map<${ScalarType[field.mapKey]}, ${typeOf(field)}>`;
  }
  const label = field.proto.proto3Optional ? "optional " : "";
  const oneof =
    field.oneof && !field.proto.proto3Optional ? ` in ${field.oneof.name}` : "";
  return `${field.number} ${label}${typeOf(field)}${oneof}`;
};

const wire = (root: DescMessage): string[] => {
  const lines: string[] = [];
  const seen = new Set<string>();
  const visit = (desc: DescMessage | DescEnum): void => {
    if (seen.has(desc.typeName)) {
      return;
    }
    seen.add(desc.typeName);
    if (desc.kind === "enum") {
      lines.push(
        `enum ${desc.typeName}: ${desc.values.map((v) => v.number).join(", ")}`
      );
      return;
    }
    lines.push(
      `message ${desc.typeName}: ${desc.fields.map(describeField).join("; ")}`
    );
    for (const field of desc.fields) {
      const held = field.message ?? field.enum;
      if (held) {
        visit(held);
      }
    }
  };
  visit(root);
  return lines.toSorted();
};

const fingerprint = createHash("sha256")
  .update(wire(ChangeSchema).join("\n"))
  .digest("hex")
  .slice(0, 16);

const swift = await readFile(SYNC_SWIFT, "utf-8");
const declared = /static let schema = (?<n>\d+)/u.exec(swift)?.groups?.n;
if (declared === undefined) {
  throw new Error(`${SYNC_SWIFT}: no \`static let schema = <n>\``);
}
const schema = Number(declared);

const parsed: unknown = JSON.parse(await readFile(RECORD, "utf-8"));
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
    RECORD,
    `${JSON.stringify({ fingerprint, schema }, null, 2)}\n`
  );
  process.exit(0);
}
console.error(
  `Sync.schema is ${schema} and ${RECORD} records ${recorded.schema}: run \`mise run sync:check -- --write\`.`
);
process.exit(1);
