import { expect, test } from "bun:test";
import { resolveAuthRedirect } from "../convex-lib/authRedirect";

test("allows native auth and the configured deletion page only", () => {
  expect(resolveAuthRedirect("pochical://auth", undefined)).toBe(
    "pochical://auth"
  );
  expect(
    resolveAuthRedirect(
      "https://example.com/account/delete",
      "https://example.com"
    )
  ).toBe("https://example.com/account/delete");
  expect(
    resolveAuthRedirect(
      "http://localhost:3000/account/delete",
      "http://localhost:3000"
    )
  ).toBe("http://localhost:3000/account/delete");
});

test("rejects unconfigured sites, lookalike origins, alternate paths and redirect parameters", () => {
  for (const url of [
    "https://example.com.evil.test/account/delete",
    "https://example.com@evil.test/account/delete",
    "https://example.com/account/delete?next=https://evil.test",
    "https://example.com/account/delete#other",
    "https://example.com/other",
    "//example.com/account/delete",
    "pochical://other",
  ]) {
    expect(() => resolveAuthRedirect(url, "https://example.com")).toThrow();
  }
  expect(() =>
    resolveAuthRedirect("https://example.com/account/delete", undefined)
  ).toThrow();
  expect(() =>
    resolveAuthRedirect(
      "http://example.com/account/delete",
      "http://example.com"
    )
  ).toThrow();
});
