import { EmojiPicker } from "frimousse";
import type {
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse";
import { css } from "styled-system/css";

import { Sheet, SheetHeading } from "./design-sheet";

// Any emoji, beyond the few offered first: the 「＋」 after the reactions,
// and ほかの絵文字 for a shift pattern or a group. On the phones this is
// the platform's own: the emoji keyboard on iOS and Jetpack's
// EmojiPickerView on Android, so the prototype only stands in for them.
// Frimousse draws the list, searchable in Japanese, and the look is ours.

const emojiColumns = 8;

const picker = {
  categoryHeader: css({
    bg: "raised",
    color: "text3",
    fontWeight: 600,
    padding: "10px 4px 6px",
    textStyle: "footnote",
  }),
  emoji: css({
    "&[data-active]": { bg: "fill2" },
    alignItems: "center",
    aspectRatio: "1",
    bg: "transparent",
    border: 0,
    borderRadius: "10px",
    display: "flex",
    flex: 1,
    fontSize: "24px",
    justifyContent: "center",
    padding: 0,
  }),
  note: css({
    color: "text3",
    padding: "24px 0",
    textAlign: "center",
    textStyle: "subheadline",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
  }),
  row: css({ display: "flex", paddingInline: "2px" }),
  search: css({
    _focusVisible: { outline: "2px solid token(colors.accent)" },
    _placeholder: { color: "text3" },
    bg: "fill",
    border: 0,
    borderRadius: "action",
    color: "text",
    font: "inherit",
    height: "action",
    paddingInline: "14px",
    textStyle: "body",
    width: "100%",
  }),
  viewport: css({
    height: "340px",
    marginInline: "-4px",
    overflowY: "auto",
    position: "relative",
  }),
};

function CategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div className={picker.categoryHeader} {...props}>
      {category.label}
    </div>
  );
}

function Row({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div className={picker.row} {...props}>
      {children}
    </div>
  );
}

function EmojiButton({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      aria-label={emoji.label}
      className={picker.emoji}
      data-active={emoji.isActive ? "" : undefined}
      {...props}
      type="button"
    >
      {emoji.emoji}
    </button>
  );
}

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
      <EmojiPicker.Root
        className={picker.root}
        columns={emojiColumns}
        locale="ja"
        onEmojiSelect={({ emoji }) => {
          onPick(emoji);
          onOpenChange(false);
        }}
      >
        <EmojiPicker.Search
          aria-label="絵文字を検索"
          className={picker.search}
          // The names are Unicode's Japanese ones, in kanji and katakana,
          // so a word in hiragana alone finds little.
          placeholder="検索（例：猫、ハート）"
        />
        <EmojiPicker.Viewport className={picker.viewport}>
          <EmojiPicker.Loading className={picker.note}>
            読み込んでいます
          </EmojiPicker.Loading>
          <EmojiPicker.Empty className={picker.note}>
            見つかりませんでした
          </EmojiPicker.Empty>
          <EmojiPicker.List
            components={{ CategoryHeader, Emoji: EmojiButton, Row }}
          />
        </EmojiPicker.Viewport>
      </EmojiPicker.Root>
    </Sheet>
  );
}
