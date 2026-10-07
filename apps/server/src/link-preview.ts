import { create } from "@bufbuild/protobuf";

import { LinkPreviewSchema } from "./gen/pochical/v1/chat_pb";
import type { LinkPreview } from "./gen/pochical/v1/chat_pb";

// A link's page read for its preview (spec/chat.md, Reading a page): the
// server reads it, so people's addresses are not sent to the sites, and
// keeps its picture, so it shows after the site changes or removes it.

/** The most redirects followed to the page or its picture. */
const MAX_REDIRECTS = 3;
/** How long a page or its picture may take. */
const FETCH_MS = 5000;
/** How much of a page's HTML is read: its head is near the start. */
const PAGE_BYTES = 512 * 1024;
/** The largest picture kept; a larger one is left out. */
const IMAGE_BYTES = 2_000_000;
/** How long a page's preview is kept before it is read again. */
const CACHE_MS = 24 * 60 * 60 * 1000;
/** A title or site name is cut to this many characters. */
const TEXT_MAX = 300;

const PRIVATE_V4 =
  /^(?:0|10|127)\.|^169\.254\.|^172\.(?:1[6-9]|2\d|3[01])\.|^192\.168\.|^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u;

/**
 * Whether the server may read `url`: http or https on their own ports, to
 * a named host or a public address. Addresses on private, loopback or
 * link-local ranges are refused, as the page's own redirects are.
 */
export const mayRead = (url: URL): boolean => {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "" || host === "localhost" || host.endsWith(".localhost")) {
    return false;
  }
  if (IPV4.test(host)) {
    return !PRIVATE_V4.test(host);
  }
  // IPv6 literals ([::1], [fc00::], [fe80::]…) are not read at all.
  return !host.startsWith("[");
};

/**
 * A GET that follows redirects itself, checking each, at most 3: the
 * answer, and the address it came from in the end.
 */
const fetchChecked = async (
  url: URL,
  accept: string
): Promise<{ response: Response; at: URL } | null> => {
  let at = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!mayRead(at)) {
      return null;
    }
    // oxlint-disable-next-line no-await-in-loop -- each hop follows the last
    const response = await fetch(at, {
      headers: { Accept: accept, "User-Agent": "PochicalBot/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    const location = response.headers.get("Location");
    if (response.status < 300 || response.status >= 400 || location === null) {
      return response.ok ? { at, response } : null;
    }
    at = new URL(location, at);
  }
  return null;
};

/** The first `limit` bytes of a body. */
const readUpTo = async (
  response: Response,
  limit: number
): Promise<Uint8Array | null> => {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    // oxlint-disable-next-line no-await-in-loop -- a body is read in order
    const read = await reader.read();
    const value: unknown = read.value;
    if (read.done || !(value instanceof Uint8Array)) {
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel();
  const bytes = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.byteLength - offset);
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
};

/** What a page says of itself in its head. */
export type PageTags = {
  ogTitle?: string;
  title?: string;
  siteName?: string;
  image?: string;
};

const clean = (text: string | undefined): string | undefined => {
  const trimmed = text?.replaceAll(/\s+/gu, " ").trim();
  return trimmed === undefined || trimmed === ""
    ? undefined
    : trimmed.slice(0, TEXT_MAX);
};

/** A page's og:title, <title>, og:site_name and og:image, from its HTML. */
export const pageTags = async (html: Uint8Array): Promise<PageTags> => {
  const tags: PageTags = {};
  let title = "";
  const meta = (property: string, content: string | null): void => {
    if (content === null) {
      return;
    }
    if (property === "og:title") {
      tags.ogTitle ??= content;
    } else if (property === "og:site_name") {
      tags.siteName ??= content;
    } else if (property === "og:image" || property === "og:image:url") {
      tags.image ??= content;
    }
  };
  const rewriter = new HTMLRewriter()
    .on("meta", {
      element: (element) => {
        meta(
          element.getAttribute("property") ??
            element.getAttribute("name") ??
            "",
          element.getAttribute("content")
        );
      },
    })
    .on("title", {
      text: (text) => {
        title += text.text;
      },
    });
  await rewriter
    .transform(new Response(html, { headers: { "Content-Type": "text/html" } }))
    .arrayBuffer();
  return {
    image: clean(tags.image),
    ogTitle: clean(tags.ogTitle),
    siteName: clean(tags.siteName),
    title: clean(title),
  };
};

// WebP keeps its sizes in 14 and 24 bits.
const TWO_14 = 16_384;
const TWO_24 = 16_777_216;

/** A WebP's size from its VP8X, VP8 or VP8L header. */
const webpSize = (
  bytes: Uint8Array,
  view: DataView
): { width: number; height: number } | null => {
  const kind = String.fromCodePoint(...bytes.subarray(12, 16));
  if (kind === "VP8X") {
    return {
      height: 1 + (view.getUint32(27, true) % TWO_24),
      width: 1 + (view.getUint32(24, true) % TWO_24),
    };
  }
  if (kind === "VP8 ") {
    return {
      height: view.getUint16(28, true) % TWO_14,
      width: view.getUint16(26, true) % TWO_14,
    };
  }
  if (kind === "VP8L") {
    const bits = view.getUint32(21, true);
    return {
      height: (Math.floor(bits / TWO_14) % TWO_14) + 1,
      width: (bits % TWO_14) + 1,
    };
  }
  return null;
};

/** A JPEG's, PNG's, GIF's or WebP's size from its first bytes. */
export const imageSize = (
  bytes: Uint8Array
): { width: number; height: number } | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: the IHDR chunk's width and height.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.byteLength >= 24) {
    return { height: view.getUint32(20), width: view.getUint32(16) };
  }
  // GIF: the logical screen's.
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes.byteLength >= 10) {
    return {
      height: view.getUint16(8, true),
      width: view.getUint16(6, true),
    };
  }
  // WebP: its VP8X, VP8 or VP8L header's.
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes.byteLength >= 30) {
    return webpSize(bytes, view);
  }
  // JPEG: the first start-of-frame marker's.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let at = 2;
  while (at + 9 < bytes.byteLength) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1] ?? 0;
    const length = view.getUint16(at + 2);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    at += 2 + length;
  }
  return null;
};

/** Where a preview's picture is kept, and a page's preview is cached. */
export const previewImageKey = (imageId: string): string =>
  `previews/images/${imageId}`;

const pageKey = async (url: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url)
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `previews/pages/${hex}.json`;
};

/** The page's picture kept in the bucket, with its size, if it reads. */
const keepImage = async (
  bucket: R2Bucket,
  image: URL
): Promise<{ id: string; width: number; height: number } | null> => {
  const fetched = await fetchChecked(image, "image/*");
  const response = fetched?.response;
  const type = response?.headers.get("Content-Type") ?? "";
  if (response === undefined || !type.startsWith("image/")) {
    return null;
  }
  const bytes = await readUpTo(response, IMAGE_BYTES + 1);
  const size = bytes === null ? null : imageSize(bytes);
  if (bytes === null || bytes.byteLength > IMAGE_BYTES || size === null) {
    return null;
  }
  const id = crypto.randomUUID();
  await bucket.put(previewImageKey(id), bytes, {
    httpMetadata: { contentType: type },
  });
  return { id, ...size };
};

/** The page's preview, read now. */
const readPreview = async (
  bucket: R2Bucket,
  url: URL
): Promise<LinkPreview | null> => {
  const fetched = await fetchChecked(url, "text/html");
  if (fetched === null) {
    return null;
  }
  // Its own address after any redirects, for its picture and site.
  const { at, response: page } = fetched;
  if (!(page.headers.get("Content-Type") ?? "").includes("html")) {
    return null;
  }
  const html = await readUpTo(page, PAGE_BYTES);
  if (html === null) {
    return null;
  }
  const tags = await pageTags(html);
  const imageURL =
    tags.image === undefined ? null : URL.parse(tags.image, at.href);
  const image = imageURL === null ? null : await keepImage(bucket, imageURL);
  return create(LinkPreviewSchema, {
    imageHeight: image?.height ?? 0,
    imageId: image?.id ?? "",
    imageWidth: image?.width ?? 0,
    site: tags.siteName ?? at.hostname.replace(/^www\./u, ""),
    title: tags.ogTitle ?? tags.title ?? url.href.replace(/^https?:\/\//u, ""),
    url: url.href,
  });
};

/**
 * A link's preview: cached by URL for a day, else read now and cached;
 * null when no page was found.
 */
export const linkPreview = async (
  bucket: R2Bucket,
  url: URL
): Promise<LinkPreview | null> => {
  const key = await pageKey(url.href);
  const cached = await bucket.get(key);
  if (cached !== null) {
    const kept = await cached.json<{
      at: number;
      preview: LinkPreview | null;
    }>();
    if (Date.now() - kept.at < CACHE_MS) {
      return kept.preview === null
        ? null
        : create(LinkPreviewSchema, kept.preview);
    }
  }
  // A page that could not be reached (a timeout, a dropped connection) is
  // not kept, so it is read again next time; one read without a page is.
  try {
    const preview = await readPreview(bucket, url);
    await bucket.put(key, JSON.stringify({ at: Date.now(), preview }));
    return preview;
  } catch {
    return null;
  }
};
