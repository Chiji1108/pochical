import { EmojiPicker } from "frimousse";
import type {
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse";

import { pickerStyle as picker } from "./design-picker-style";

// EmojiPickerSheet's list (design-emoji-picker.tsx), in a module of its
// own so Frimousse loads when the sheet first opens, not with every page.

const emojiColumns = 8;

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
      className={picker.choice}
      data-active={emoji.isActive ? "" : undefined}
      {...props}
      type="button"
    >
      {emoji.emoji}
    </button>
  );
}

export default function EmojiList({
  onPick,
  noteClassName,
}: {
  onPick: (emoji: string) => void;
  noteClassName: string;
}) {
  return (
    <EmojiPicker.Root
      className={picker.root}
      columns={emojiColumns}
      locale="ja"
      onEmojiSelect={({ emoji }) => {
        onPick(emoji);
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
        <EmojiPicker.Loading className={noteClassName}>
          読み込んでいます
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className={noteClassName}>
          見つかりませんでした
        </EmojiPicker.Empty>
        <EmojiPicker.List
          components={{ CategoryHeader, Emoji: EmojiButton, Row }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
