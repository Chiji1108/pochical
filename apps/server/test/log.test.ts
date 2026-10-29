import { describe, expect, it } from "vitest";

import { errorFields } from "../src/log";

describe("a logged error", () => {
  it("keeps an Error's name, message, stack and cause as plain fields", () => {
    const cause = new RangeError("D1 is busy");
    const error = new Error("Failed query", { cause });
    expect(errorFields(error)).toStrictEqual({
      cause: { message: "D1 is busy", name: "RangeError", stack: cause.stack },
      message: "Failed query",
      name: "Error",
      stack: error.stack,
    });
  });

  it("is a message alone when what was thrown is not an Error", () => {
    expect(errorFields("refused")).toStrictEqual({ message: "refused" });
  });
});
