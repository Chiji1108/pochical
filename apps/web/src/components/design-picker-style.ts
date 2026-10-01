import { css } from "styled-system/css";

// The look shared by the sheets that pick from many: every emoji
// (design-emoji-list.tsx) and every icon (design-icon-picker.tsx). A search
// over a list that scrolls under its kinds' headings, eight to a row.
export const pickerStyle = {
  categoryHeader: css({
    bg: "background.elevated",
    color: "text.tertiary",
    fontWeight: 600,
    margin: 0,
    padding: "12px 4px 8px",
    position: "sticky",
    textStyle: "footnote",
    top: 0,
    zIndex: 1,
  }),
  choice: css({
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
  note: css({
    color: "text.tertiary",
    padding: "24px 0",
    textAlign: "center",
    textStyle: "subheadline",
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
