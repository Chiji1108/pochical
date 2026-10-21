// Fails when the wire the iOS app takes Changes from changes while its
// sync schema (`Sync.schema`) stays (spec/sync-protocol.md, Change log
// and cursor). A device moves its cursor past what it cannot read, so an
// app that starts reading something new must raise the schema to take
// everything again.
//
//   bun tools/sync-schema/check.ts [--write]
//
// The wire is `pochical.v1.Change` and every message and enum it holds,
// as `buf build` reads proto/, by field number, type, label and oneof.
// Names (of fields, values, messages, enums and oneofs) and the order
// things are written in are left out: none changes what a device holds. The rest of proto/
// (edits, pages, Welcome, comments) does not count. `--write` records the
// fingerprint, once Sync.schema is raised past the recorded one.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createFileRegistry, fromBinary, ScalarType } from "@bufbuild/protobuf";
import type { DescEnum, DescField, DescMessage } from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";

const root = path.join(import.meta.dir, "../..");
const SYNC_SWIFT =
  "apps/ios/Packages/PochicalKit/Sources/PochicalKit/Sync.swift";
const RECORD = "apps/ios/Packages/PochicalKit/sync-wire.json";

const registry = createFileRegistry(
  fromBinary(
    FileDescriptorSetSchema,
    execFileSync("buf", ["build", "-o", "-"], { cwd: path.join(root, "proto") })
  )
);
const change = registry.getMessage("pochical.v1.Change");
if (!change) {
  throw new Error("proto/: no pochical.v1.Change");
}

const byNumber = (a: { number: number }, b: { number: number }): number =>
  a.number - b.number;

// Types are named by the order they are first reached from Change, so a
// renamed message or enum reads the same.
const wire = (from: DescMessage): string[] => {
  const ids = new Map<string, number>();
  const reached: (DescMessage | DescEnum)[] = [];
  const idOf = (desc: DescMessage | DescEnum): string => {
    let id = ids.get(desc.typeName);
    if (id === undefined) {
      id = reached.length;
      ids.set(desc.typeName, id);
      reached.push(desc);
    }
    return `#${id}`;
  };
  const typeOf = (field: DescField): string => {
    const held = field.message ?? field.enum;
    return held ? idOf(held) : ScalarType[field.scalar ?? ScalarType.BYTES];
  };
  const describe = (field: DescField): string => {
    if (field.fieldKind === "list") {
      return `${field.number} repeated ${typeOf(field)}`;
    }
    if (field.fieldKind === "map") {
      return `${field.number} map<${ScalarType[field.mapKey]}, ${typeOf(field)}>`;
    }
    const label = field.proto.proto3Optional ? "optional " : "";
    const oneof =
      field.oneof && !field.proto.proto3Optional
        ? ` in oneof of ${Math.min(...field.oneof.fields.map((f) => f.number))}`
        : "";
    return `${field.number} ${label}${typeOf(field)}${oneof}`;
  };

  idOf(from);
  const lines: string[] = [];
  for (const desc of reached) {
    lines.push(
      desc.kind === "enum"
        ? `${idOf(desc)} enum: ${desc.values
            .toSorted(byNumber)
            .map((v) => v.number)
            .join(", ")}`
        : `${idOf(desc)} message: ${desc.fields.toSorted(byNumber).map(describe).join("; ")}`
    );
  }
  return lines;
};

const fingerprint = createHash("sha256")
  .update(wire(change).join("\n"))
  .digest("hex")
  .slice(0, 16);

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
