// What a chat line is (spec/chat.md, What a line is), as the Group DO
// keeps it in chat_lines.content: one of its kinds, each with only what
// that kind holds, so a line with nothing in it, or with words and days
// at once, cannot be written.

import type { KeptPreview } from "./link-preview";

/** A photo as a line keeps it: pochical.v1.ChatPhoto's fields, its ThumbHash as base64. */
export type KeptPhoto = {
  id: string;
  height: number;
  thumbHash?: string;
  width: number;
};

/** A sticker as a line keeps it: pochical.v1.ChatSticker's fields. */
export type KeptSticker = {
  id: string;
  height: number;
  width: number;
};

/** What happened to the group, as a notice line keeps it. */
export type Notice = {
  kind:
    | "joined"
    | "left"
    | "removed"
    | "removedByPochical"
    | "inviteRemade"
    | "profileChanged"
    | "endSet"
    | "endCleared"
    | "endsSoon";
  // endSet, endsSoon: when the group ends, in ms since the epoch.
  endsAt?: number;
  markChanged?: boolean;
  name?: string;
  subjectId?: string;
};

export type LineContent =
  | {
      kind: "words";
      text: string;
      edited: boolean;
      preview: KeptPreview | null;
    }
  | { kind: "photos"; photos: KeptPhoto[] }
  | { kind: "sticker"; sticker: KeptSticker }
  | { kind: "days"; days: string[] }
  | { kind: "poll"; days: string[]; decided: string | null }
  | { kind: "notice"; notice: Notice }
  | { kind: "unsent" };

export type LineKind = LineContent["kind"];

/** What a member sends: neither a notice nor a line taken back. */
export type SentContent = Exclude<LineContent, { kind: "notice" | "unsent" }>;

/**
 * What the line carries of the group's photos, each uploaded as a photo
 * is and going with the line: an album's photos, or its sticker; none for
 * any other kind.
 */
export const photosOf = (content: LineContent): KeptPhoto[] => {
  switch (content.kind) {
    case "photos": {
      return content.photos;
    }
    case "sticker": {
      return [content.sticker];
    }
    case "words":
    case "days":
    case "poll":
    case "notice":
    case "unsent": {
      return [];
    }
    default: {
      return content satisfies never;
    }
  }
};
