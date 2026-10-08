import { iconNames } from "@pochical/design/mark-icon-names";
import { offeredMarkIcons } from "@pochical/design/patterns";
import { Plus } from "lucide-react";
import { useContext, useState } from "react";
import type { ReactNode } from "react";

import {
  Choice,
  ChoiceGrid,
  colorGrid,
  markGrid,
  Segment,
  SegmentedControl,
} from "./design-choices";
import { EmojiPickerSheet } from "./design-emoji-picker";
import { MarkLetterInput, markPreview } from "./design-fields";
import { PageHeader } from "./design-header";
import { IconPickerSheet } from "./design-icon-picker";
import { List, ListRow } from "./design-list";
import { Button, fieldLabel, Note } from "./design-ui";
import {
  MarkGlyph,
  MonochromeContext,
  useMarkColors,
  markEmojis,
  ShiftMarkStyleContext,
} from "./shift-mark";
import type { Look, MarkIcon, ShiftMarkStyle } from "./shift-mark";

// The parts of a look that someone picks; picked ones stop following the
// name when it changes.
export type LookField = "symbol" | "icon" | "emoji" | "color";

export const styleNames: Record<ShiftMarkStyle, string> = {
  badge: "文字",
  emoji: "絵文字",
  icon: "アイコン",
};

// The icons offered first, a row of eight for each kind like the emoji
// (design/src/patterns.ts). Every other one is in IconPickerSheet.
const offeredIcons = offeredMarkIcons;

// One screen for choosing how something is marked in every style: shift
// patterns and groups alike. Each tab shows its own look, so what people
// on other styles see is never hidden.
export function LookEditorPage({
  title,
  back,
  look,
  icons = offeredIcons,
  emojis = markEmojis,
  onBack,
  onPick,
  children,
}: {
  title: string;
  back: string;
  look: Look;
  icons?: readonly MarkIcon[];
  emojis?: readonly string[];
  onBack: () => void;
  onPick: (field: LookField, value: Partial<Look>) => void;
  // Warnings under the open tab's choices.
  children?: (tab: ShiftMarkStyle) => ReactNode;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [tab, setTab] = useState<ShiftMarkStyle>(style);
  return (
    <>
      <PageHeader back={back} onBack={onBack} title={title} />
      <div className={markPreview({ alone: true })}>
        <LookGlyph look={look} size={48} style={tab} />
      </div>
      <SegmentedControl
        label="どの見た目の印を選ぶか"
        onValueChange={setTab}
        value={tab}
      >
        {(["icon", "emoji", "badge"] as const).map((option) => (
          <Segment key={option} value={option}>
            <LookGlyph look={look} size={20} style={option} />
            {styleNames[option]}
          </Segment>
        ))}
      </SegmentedControl>
      {tab === "icon" && <IconGrid icons={icons} look={look} onPick={onPick} />}
      {tab === "emoji" && (
        <EmojiGrid emojis={emojis} look={look} onPick={onPick} />
      )}
      {tab === "badge" && <LetterEditor look={look} onPick={onPick} />}
      {tab !== "emoji" && <ColorPicker look={look} onPick={onPick} />}
      {children?.(tab)}
    </>
  );
}

// Without an emoji, the emoji style falls back to the letters.
export function LookGlyph({
  look,
  size,
  style,
}: {
  look: Look;
  size: number;
  style: ShiftMarkStyle;
}) {
  return (
    <MarkGlyph
      look={look}
      size={size}
      style={style === "emoji" && !look.emoji ? "badge" : style}
    />
  );
}

function IconGrid({
  look,
  icons,
  onPick,
}: {
  look: Look;
  icons: readonly MarkIcon[];
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <ChoiceGrid
        className={markGrid}
        label="アイコン"
        onValueChange={(icon) => {
          onPick("icon", { icon });
        }}
        value={look.icon ?? null}
      >
        {withPicked(icons, look.icon).map((icon) => (
          <Choice key={icon} label={iconNames[icon]} value={icon}>
            <MarkGlyph look={{ ...look, icon }} size={20} style="icon" />
          </Choice>
        ))}
      </ChoiceGrid>
      <OtherChoicesButton
        onClick={() => {
          setPicking(true);
        }}
      >
        ほかのアイコンを選ぶ
      </OtherChoicesButton>
      <IconPickerSheet
        renderIcon={(icon) => (
          <MarkGlyph look={{ ...look, icon }} size={24} style="icon" />
        )}
        onOpenChange={setPicking}
        onPick={(icon) => {
          onPick("icon", { icon });
        }}
        open={picking}
        picked={look.icon}
      />
    </>
  );
}

function EmojiGrid({
  look,
  emojis,
  onPick,
}: {
  look: Look;
  emojis: readonly string[];
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <ChoiceGrid
        className={markGrid}
        label="絵文字"
        onValueChange={(emoji) => {
          onPick("emoji", { emoji });
        }}
        value={look.emoji ?? null}
      >
        {withPicked(emojis, look.emoji).map((emoji) => (
          <Choice key={emoji} value={emoji}>
            <MarkGlyph look={{ ...look, emoji }} size={20} style="emoji" />
          </Choice>
        ))}
      </ChoiceGrid>
      <OtherChoicesButton
        onClick={() => {
          setPicking(true);
        }}
      >
        ほかの絵文字を選ぶ
      </OtherChoicesButton>
      <EmojiPickerSheet
        onOpenChange={setPicking}
        onPick={(emoji) => {
          onPick("emoji", { emoji });
        }}
        open={picking}
      />
    </>
  );
}

// One picked from the whole sheet leads the ones offered, so it shows as
// picked among them.
export function withPicked<Value extends string>(
  offered: readonly Value[],
  picked?: Value
) {
  return picked && !offered.includes(picked) ? [picked, ...offered] : offered;
}

// After the emoji or icons offered, the way to every other one.
export function OtherChoicesButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button onClick={onClick} variant="quiet">
      <Plus aria-hidden="true" size={18} />
      {children}
    </Button>
  );
}

// One letter, like a printed roster; the name can show under it.
function LetterEditor({
  look,
  onPick,
}: {
  look: Look;
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  return (
    <List>
      <ListRow
        label="文字"
        control={
          <MarkLetterInput
            kind="shiftMark"
            onLetter={(symbol) => {
              onPick("symbol", { symbol });
            }}
            value={look.symbol}
          />
        }
      />
    </List>
  );
}

function ColorPicker({
  look,
  onPick,
}: {
  look: Look;
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  const colors = useMarkColors();
  const { monochrome } = useContext(MonochromeContext);
  return (
    <>
      <ChoiceGrid
        className={colorGrid}
        label="色"
        labelClassName={fieldLabel({ place: "grid" })}
        onValueChange={(value) => {
          onPick("color", { color: Number(value) });
        }}
        value={String(look.color)}
      >
        {colors.map(({ name, color, tint }, index) => (
          <Choice
            key={name}
            label={name}
            style={{ background: tint, color }}
            value={String(index)}
          />
        ))}
      </ChoiceGrid>
      {/* With シフトの色 at ワントーン every mark takes the theme color, so
          say when this choice shows. */}
      {monochrome && (
        <Note>
          スタイルの「シフトの色」を色分けにすると、この色で表示されます。
        </Note>
      )}
    </>
  );
}
