import { describe, expect, test } from "vitest";

// The cases every platform checks its own code against (spec/vectors).
import hlc from "../../../spec/vectors/hlc.json";
import text from "../../../spec/vectors/text.json";
import { compareClocks } from "../src/hlc";
import { characterCount } from "../src/text-limits";

describe("spec/vectors/hlc.json", () => {
  test.each(hlc.compare)("$name", ({ a, b, expected }) => {
    expect(Math.sign(compareClocks(a, b))).toBe(expected);
  });
});

// The server holds text to the limits with its own count, which must be
// the apps'.
describe("spec/vectors/text.json", () => {
  test.each(text.characterCount)("$name", ({ text: written, expected }) => {
    expect(characterCount(written)).toBe(expected);
  });
});
