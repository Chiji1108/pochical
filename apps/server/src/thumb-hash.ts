import { chatRules } from "@pochical/design/chat";

// A chat photo's ThumbHash (spec/chat.md, Photos): made by its sender,
// kept as base64 beside the photo's size and handed on as it came.

/** Whether a sent ThumbHash may be kept: none, or one no longer than the format makes. */
export const fitsThumbHash = (thumbHash: Uint8Array): boolean =>
  thumbHash.length <= chatRules.photoThumbHashMaxBytes;

/** A ThumbHash as kept: base64, or none for an empty one. */
export const keptThumbHash = (thumbHash: Uint8Array): string | undefined =>
  thumbHash.length === 0 ? undefined : btoa(String.fromCodePoint(...thumbHash));

/** A kept ThumbHash as the wire carries it: empty for none. */
export const sentThumbHash = (kept: string | null | undefined): Uint8Array =>
  kept === null || kept === undefined
    ? new Uint8Array()
    : Uint8Array.from(atob(kept), (char) => char.codePointAt(0) ?? 0);
