import { lazy, Suspense } from "react";
import { css } from "styled-system/css";

import { Sheet, SheetHeading } from "./design-sheet";

// Any emoji, beyond the few offered first: the 「＋」 after the reactions,
// and ほかの絵文字 for a shift pattern or a group. On the phones this is
// the platform's own: the emoji keyboard on iOS and Jetpack's
// EmojiPickerView on Android, so the prototype only stands in for them.
// Frimousse draws the list, searchable in Japanese, and the look is ours.

const EmojiList = lazy(async () => await import("./design-emoji-list"));

const note = css({
  color: "text.tertiary",
  padding: "24px 0",
  textAlign: "center",
  textStyle: "subheadline",
});

// The picker in a sheet over the phone; picking closes it.
export function EmojiPickerSheet({
  open,
  onOpenChange,
  title = "絵文字を選ぶ",
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onPick: (emoji: string) => void;
}) {
  return (
    <Sheet label={title} onOpenChange={onOpenChange} open={open}>
      <SheetHeading
        onClose={() => {
          onOpenChange(false);
        }}
        title={title}
      />
      <Suspense fallback={<p className={note}>読み込んでいます</p>}>
        <EmojiList
          noteClassName={note}
          onPick={(emoji) => {
            onPick(emoji);
            onOpenChange(false);
          }}
        />
      </Suspense>
    </Sheet>
  );
}
