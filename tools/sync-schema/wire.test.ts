import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { wireFingerprint } from "./wire";

const base = `syntax = "proto3";
package pochical.v1;

message Change {
  uint64 cursor = 1;
  oneof kind {
    ChatLine chat_line = 2;
    ChatSend send = 3;
  }
}

message ChatLine {
  string text = 1;
  uint32 seq = 2;
  repeated Photo photos = 3;
  Kind kind = 4;
}

message Photo {
  string id = 1;
}

enum Kind {
  KIND_UNSPECIFIED = 0;
  KIND_TEXT = 1;
}

message ChatSend {
  string text = 1;
}

message Edit {
  string text = 1;
}
`;

const fingerprintOf = (proto: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "sync-wire-"));
  writeFileSync(path.join(dir, "buf.yaml"), "version: v2\n");
  mkdirSync(path.join(dir, "pochical/v1"), { recursive: true });
  writeFileSync(path.join(dir, "pochical/v1/sync.proto"), proto);
  return wireFingerprint(dir);
};

const edited = (from: string, to: string): string => {
  if (!base.includes(from)) {
    throw new Error(`the base proto has no ${from}`);
  }
  return base.replace(from, to);
};

const before = fingerprintOf(base);

describe("a device holds the same after", () => {
  test.each([
    [
      "fields reordered",
      edited(
        "  string text = 1;\n  uint32 seq = 2;",
        "  uint32 seq = 2;\n  string text = 1;"
      ),
    ],
    [
      "a field renamed",
      edited("repeated Photo photos = 3;", "repeated Photo pictures = 3;"),
    ],
    ["a message renamed", base.replaceAll("Photo", "Picture")],
    ["a oneof renamed", edited("oneof kind {", "oneof value {")],
    [
      "a comment added",
      edited(
        "  uint32 seq = 2;",
        "  // The line's place in its chat.\n  uint32 seq = 2;"
      ),
    ],
    [
      "a message outside Change changed",
      edited(
        "message Edit {\n  string text = 1;",
        "message Edit {\n  string text = 1;\n  bool on = 2;"
      ),
    ],
  ])("%s", (_, proto) => {
    expect(fingerprintOf(proto)).toBe(before);
  });
});

describe("a device must take everything again after", () => {
  test.each([
    [
      "a field added",
      edited("  Kind kind = 4;", "  Kind kind = 4;\n  bool hidden = 5;"),
    ],
    ["a field's number changed", edited("uint32 seq = 2;", "uint32 seq = 6;")],
    ["a field's type changed", edited("uint32 seq = 2;", "uint64 seq = 2;")],
    [
      "a field made repeated",
      edited(
        "  string text = 1;\n  uint32",
        "  repeated string text = 1;\n  uint32"
      ),
    ],
    [
      "a field moved out of a oneof",
      edited("    ChatSend send = 3;\n  }", "  }\n  ChatSend send = 3;"),
    ],
    [
      "an enum value added",
      edited("  KIND_TEXT = 1;", "  KIND_TEXT = 1;\n  KIND_PHOTOS = 2;"),
    ],
    [
      "a held message changed",
      edited(
        "message Photo {\n  string id = 1;",
        "message Photo {\n  string id = 1;\n  uint32 width = 2;"
      ),
    ],
  ])("%s", (_, proto) => {
    expect(fingerprintOf(proto)).not.toBe(before);
  });
});
