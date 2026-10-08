import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { imageSize, linkPreview, mayRead, pageTags } from "../src/link-preview";

const html = (body: string) => new Uint8Array(new TextEncoder().encode(body));

// A 2×3 PNG's first bytes: the signature and its IHDR chunk.
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44,
  0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 6, 0, 0, 0,
]);

// What each address answers, as the sites would.
const answer = (url: string): Response => {
  if (url === "https://short.example/x") {
    return new Response(null, {
      headers: { Location: "https://cafe.example/menu" },
      status: 301,
    });
  }
  if (url === "https://cafe.example/a.png") {
    return new Response(PNG, { headers: { "Content-Type": "image/png" } });
  }
  return new Response(
    '<meta property="og:title" content="メニュー"><meta property="og:image" content="/a.png">',
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};

describe("a link's preview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads og tags first, then the title, from a page's head", async () => {
    const tags = await pageTags(
      html(`<html><head><title> 店の
        ページ </title><meta property="og:title" content="カフェ">
        <meta property="og:site_name" content="Cafe">
        <meta property="og:image" content="/a.png"></head></html>`)
    );
    expect(tags).toStrictEqual({
      image: "/a.png",
      ogTitle: "カフェ",
      siteName: "Cafe",
      title: "店の ページ",
    });
  });

  it("knows a picture's size from its first bytes", () => {
    expect(imageSize(PNG)).toStrictEqual({ height: 3, width: 2 });
    expect(imageSize(html("not a picture"))).toBeNull();
  });

  it("reads only http and https to public hosts on their own ports", () => {
    const readable = [
      "https://cafe.example/",
      "http://cafe.example:80/",
      "https://8.8.8.8/",
      "ftp://cafe.example/",
      "https://cafe.example:8443/",
      "http://localhost/",
      "http://127.0.0.1/",
      "http://192.168.1.1/",
      "http://10.0.0.1/",
      "http://169.254.169.254/",
      "http://[::1]/",
    ].map((url) => mayRead(new URL(url)));
    expect(readable).toStrictEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("follows a redirect, keeps the picture and caches the page", async () => {
    const fetched: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const { url } = new Request(input);
      fetched.push(url);
      return await Promise.resolve(answer(url));
    });
    const preview = await linkPreview(
      env.PHOTOS,
      new URL("https://short.example/x")
    );
    expect(preview).toMatchObject({
      imageHeight: 3,
      imageWidth: 2,
      site: "cafe.example",
      title: "メニュー",
      url: "https://short.example/x",
    });
    await expect(
      env.PHOTOS.head(`previews/images/${preview?.imageId ?? ""}`)
    ).resolves.not.toBeNull();

    // Asked again, the page comes from the cache.
    await linkPreview(env.PHOTOS, new URL("https://short.example/x"));
    expect(fetched).toStrictEqual([
      "https://short.example/x",
      "https://cafe.example/menu",
      "https://cafe.example/a.png",
    ]);
  });

  it("finds no page behind a redirect to a private address", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        headers: { Location: "http://192.168.0.1/" },
        status: 302,
      })
    );
    await expect(
      linkPreview(env.PHOTOS, new URL("https://sneaky.example/"))
    ).resolves.toBeNull();
  });
});
