import { EmojiPicker } from "frimousse";
import type {
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse";
import { css } from "styled-system/css";

// EmojiPickerSheet's list (design-emoji-picker.tsx), in a module of its
// own so Frimousse loads when the sheet first opens, not with every page.

const emojiColumns = 8;

const picker = {
  categoryHeader: css({
    bg: "background.elevated",
    color: "text.tertiary",
    fontWeight: 600,
    padding: "12px 4px 8px",
    textStyle: "footnote",
  }),
  emoji: css({
    "&[data-active]": { bg: "fill.tertiary" },
    alignItems: "center",
    aspectRatio: "1",
    bg: "transparent",
    border: 0,
    borderRadius: "md",
    display: "flex",
    flex: 1,
    fontSize: "24px",
    justifyContent: "center",
    padding: 0,
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minHeight: 0,
  }),
  row: css({ display: "flex", paddingInline: "2px" }),
  search: css({
    _focusVisible: { outline: "2px solid token(colors.accent.default)" },
    _placeholder: { color: "text.tertiary" },
    bg: "fill.quaternary",
    border: 0,
    borderRadius: "md",
    color: "text.primary",
    font: "inherit",
    height: "action",
    paddingInline: "16px",
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
