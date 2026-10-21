// The wire the iOS app takes Changes from: `pochical.v1.Change` and every
// message and enum it holds, as `buf build` reads a buf module, by field
// number, type, label and oneof. Names (of fields, values, messages,
// enums and oneofs) and the order things are written in are left out:
// none changes what a device holds. The rest of the module (edits, pages,
// Welcome, comments) does not count.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { createFileRegistry, fromBinary, ScalarType } from "@bufbuild/protobuf";
import type { DescEnum, DescField, DescMessage } from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";

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

export const wireFingerprint = (protoDir: string): string => {
  const registry = createFileRegistry(
    fromBinary(
      FileDescriptorSetSchema,
      execFileSync("buf", ["build", protoDir, "-o", "-"])
    )
  );
  const change = registry.getMessage("pochical.v1.Change");
  if (!change) {
    throw new Error(`${protoDir}: no pochical.v1.Change`);
  }
  return createHash("sha256")
    .update(wire(change).join("\n"))
    .digest("hex")
    .slice(0, 16);
};
