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

/** What happened to the group, as a notice line keeps it. */
export type Notice = {
  kind: "joined" | "left" | "removed" | "inviteRemade" | "profileChanged";
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
  | { kind: "days"; days: string[] }
  | { kind: "poll"; days: string[]; decided: string | null }
  | { kind: "notice"; notice: Notice }
  | { kind: "unsent" };

export type LineKind = LineContent["kind"];

/** What a member sends: neither a notice nor a line taken back. */
export type SentContent = Exclude<LineContent, { kind: "notice" | "unsent" }>;

/** The line's photos: an album's, none for any other kind. */
export const photosOf = (content: LineContent): KeptPhoto[] =>
  content.kind === "photos" ? content.photos : [];
