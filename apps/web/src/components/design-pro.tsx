import { Infinity as Forever, Palette, Smartphone, X } from "lucide-react";
import { useContext } from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { create } from "zustand";

import { useSettings } from "../lib/design-settings-store";
import { Sheet, SheetHeading } from "./design-sheet";
import {
  ColorSchemeContext,
  presetOf,
  presets,
  schemeOf,
  themeStyle,
} from "./design-theme";
import { Button, Tag } from "./design-ui";

// ポチカル Pro: one purchase, kept for good, that adds テーマ and app icons
// beyond the free ones. A Pro テーマ can be tried on first: the whole app
// shows it, with a bar to buy it or put it back. The price is a stand-in.

export const PRO_PRICE = "¥600";

export const proPresets = presets.filter((preset) => "pro" in preset);

// Whether the Pro sheet is open, from wherever asks for it: the settings
// row, a locked icon, the try-on bar.
const useProSheet = create<{ open: boolean }>(() => ({ open: false }));

export function openProSheet() {
  useProSheet.setState({ open: true });
}

// The small mark on what Pro adds.
export function ProTag() {
  return (
    <Tag className={pro.tag} size="sm" tone="accent">
      PRO
    </Tag>
  );
}

function Perk({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className={pro.perk}>
      <span aria-hidden="true" className={pro.perkIcon}>
        {icon}
      </span>
      <span>
        <strong className={pro.perkTitle}>{title}</strong>
        <span className={pro.perkText}>{children}</span>
      </span>
    </li>
  );
}

// What Pro is, and buying it. Bought, it applies the テーマ being tried on.
export function ProSheet() {
  const open = useProSheet((state) => state.open);
  const bought = useSettings((state) => state.pro);
  const tryOn = useSettings((state) => state.tryOn);
  const setPro = useSettings((state) => state.setPro);
  const setPreset = useSettings((state) => state.setPreset);
  const scheme = useContext(ColorSchemeContext);
  function close() {
    useProSheet.setState({ open: false });
  }
  function buy() {
    setPro(true);
    if (tryOn) {
      setPreset(tryOn);
    }
    close();
  }
  return (
    <Sheet
      label="ポチカル Pro"
      onOpenChange={(next) => {
        useProSheet.setState({ open: next });
      }}
      open={open}
    >
      <SheetHeading onClose={close} title="ポチカル Pro" />
      <div aria-hidden="true" className={pro.swatches}>
        {proPresets.map((preset) => (
          <span
            className={pro.swatch}
            key={preset.id}
            style={themeStyle(preset.id, schemeOf(preset.id, scheme))}
          >
            <span className={pro.swatchInk} />
            <span className={pro.swatchFill} />
          </span>
        ))}
      </div>
      <ul className={pro.perks}>
        <Perk icon={<Palette size={20} />} title="テーマが増えます">
          {proPresets.map((preset) => preset.name).join("・")}
          。これからも増えていきます。
        </Perk>
        <Perk icon={<Smartphone size={20} />} title="アプリアイコンが増えます">
          テーマに合わせた色のアイコンも選べます。
        </Perk>
        <Perk icon={<Forever size={20} />} title="一度の購入で、ずっと">
          毎月の支払いはありません。あとから増える分も使えます。
        </Perk>
      </ul>
      {bought ? (
        <p className={pro.thanks}>購入済みです。ありがとうございます！</p>
      ) : (
        <>
          <Button onClick={buy}>{PRO_PRICE}で購入</Button>
          <Button onClick={buy} variant="subtle">
            購入を復元
          </Button>
        </>
      )}
      <p className={pro.note}>
        テーマもアイコンも自分の画面だけが変わり、グループの人には影響しません。
      </p>
    </Sheet>
  );
}

// While a Pro テーマ is tried on, a pill under the status bar, where every
// screen leaves the middle free: its name, the way to keep it, and ✕ to
// put it back.
export function TryOnBar() {
  const tryOn = useSettings((state) => state.tryOn);
  const setTryOn = useSettings((state) => state.setTryOn);
  if (tryOn === undefined) {
    return null;
  }
  return (
    <div className={pro.bar} role="status">
      <span className={pro.barText}>{presetOf(tryOn).name}を試着中</span>
      <button className={pro.barKeep} onClick={openProSheet} type="button">
        使う
      </button>
      <button
        aria-label="試着をやめる"
        className={pro.barClose}
        onClick={() => {
          setTryOn(undefined);
        }}
        type="button"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

const pro = {
  bar: css({
    alignItems: "center",
    bg: "background.elevated",
    borderRadius: "999px",
    boxShadow: "0 4px 16px var(--shadow-medium)",
    display: "flex",
    gap: "4px",
    left: "50%",
    padding: "4px 4px 4px 16px",
    position: "absolute",
    top: "52px",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap",
    zIndex: 15,
  }),
  barClose: css({
    bg: "transparent",
    border: 0,
    borderRadius: "999px",
    color: "text.secondary",
    display: "grid",
    height: "32px",
    placeItems: "center",
    width: "32px",
  }),
  barKeep: css({
    bg: "accent.fill",
    border: 0,
    borderRadius: "999px",
    color: "accent.onFill",
    fontWeight: 600,
    height: "32px",
    marginLeft: "8px",
    paddingInline: "16px",
    textStyle: "subheadline",
  }),
  barText: css({ fontWeight: 600, textStyle: "subheadline" }),
  note: css({
    color: "text.tertiary",
    margin: "8px 0 0",
    textAlign: "center",
    textStyle: "footnote",
  }),
  perk: css({ alignItems: "flex-start", display: "flex", gap: "12px" }),
  perkIcon: css({
    alignItems: "center",
    bg: "accent.container",
    borderRadius: "12px",
    color: "accent.default",
    display: "flex",
    flexShrink: 0,
    height: "40px",
    justifyContent: "center",
    width: "40px",
  }),
  perkText: css({
    color: "text.secondary",
    display: "block",
    textStyle: "subheadline",
  }),
  perkTitle: css({ display: "block", textStyle: "headline" }),
  perks: css({
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    listStyle: "none",
    margin: "8px 0 24px",
    padding: 0,
  }),
  swatch: css({
    bg: "background.base",
    border: "1px solid token(colors.separator)",
    borderRadius: "16px",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "4px",
    height: "64px",
    justifyContent: "flex-end",
    padding: "12px",
  }),
  swatchFill: css({
    bg: "accent.fill",
    borderRadius: "999px",
    height: "8px",
    width: "70%",
  }),
  swatchInk: css({
    bg: "text.primary",
    borderRadius: "999px",
    height: "4px",
    width: "40%",
  }),
  swatches: css({ display: "flex", gap: "8px", marginBottom: "16px" }),
  tag: css({ letterSpacing: "0.04em" }),
  thanks: css({
    color: "accent.default",
    fontWeight: 600,
    margin: 0,
    textAlign: "center",
    textStyle: "body",
  }),
};
