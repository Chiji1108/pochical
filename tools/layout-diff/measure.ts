// What the phone shows, measured in the page by Playwright: each element
// with text, a label, a box of its own or that is a control or icon, keyed
// by what it says or is labelled (counted when a name comes again), with
// where it sits in the phone and how it is drawn.

export type Look = Record<string, number | string>;
export type Screen = Record<string, Look>;

// Playwright sends this function into the page as its source, so its
// helpers have to live inside it.
/* oxlint-disable unicorn/consistent-function-scoping */
export function measure(): Screen {
  const phone = document.querySelector(".dc-phone");
  if (phone === null) {
    throw new Error("No .dc-phone on the page");
  }
  const origin = phone.getBoundingClientRect();
  const transparent = "rgba(0, 0, 0, 0)";
  const drawnTags = new Set([
    "a",
    "button",
    "hr",
    "img",
    "input",
    "select",
    "svg",
    "textarea",
  ]);
  const sides = ["top", "right", "bottom", "left"];

  const clean = (text: string | null, length: number) =>
    (text ?? "").replaceAll(/\s+/gu, " ").trim().slice(0, length);
  const ownText = (element: Element) =>
    clean(
      [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(""),
      30
    );
  const bordersOf = (style: CSSStyleDeclaration) =>
    sides.map((side) =>
      ["width", "style", "color"]
        .map((part) => style.getPropertyValue(`border-${side}-${part}`))
        .join(" ")
    );
  // Off the phone or cut off by a box that clips, like the pager's pages
  // beside the one shown, or not drawn at all.
  const unseen = (element: Element, style: CSSStyleDeclaration) => {
    const rect = element.getBoundingClientRect();
    let [left, top, right, bottom] = [
      rect.left,
      rect.top,
      rect.right,
      rect.bottom,
    ];
    for (
      let holder: Element | null = element.parentElement;
      holder !== null && holder !== phone.parentElement;
      holder = holder.parentElement
    ) {
      const clips =
        holder === phone || getComputedStyle(holder).overflow !== "visible";
      if (clips) {
        const box = holder.getBoundingClientRect();
        left = Math.max(left, box.left);
        top = Math.max(top, box.top);
        right = Math.min(right, box.right);
        bottom = Math.min(bottom, box.bottom);
      }
    }
    const cutOff =
      (right <= left || bottom <= top) &&
      !(rect.width === 0 || rect.height === 0);
    const empty = rect.width === 0 && rect.height === 0;
    const inIcon = element.tagName !== "svg" && element.closest("svg") !== null;
    return (
      cutOff ||
      empty ||
      inIcon ||
      style.display === "none" ||
      style.visibility === "hidden"
    );
  };
  const hasBox = (style: CSSStyleDeclaration) =>
    style.backgroundColor !== transparent ||
    style.backgroundImage !== "none" ||
    style.boxShadow !== "none" ||
    style.outlineStyle !== "none" ||
    bordersOf(style).some((border) => !border.startsWith("0px"));
  // The nearest labelled element around one, like the day a date number
  // or shift icon is in, so names do not hang on the order of the page.
  const placeOf = (element: Element) => {
    const holder = element.parentElement?.closest("[aria-label]");
    return holder ? ` in [${holder.getAttribute("aria-label")}]` : "";
  };
  const nameOf = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    const label = element.getAttribute("aria-label");
    if (label !== null) {
      return `${tag}[${label}]`;
    }
    const text = ownText(element);
    if (text !== "") {
      return `${tag} "${text}"${placeOf(element)}`;
    }
    if (tag === "svg") {
      const icon =
        [...element.classList].find((item) => item.startsWith("lucide-")) ??
        "icon";
      return `svg ${icon}${placeOf(element) || ` in (${clean(element.parentElement?.textContent ?? null, 20)})`}`;
    }
    return `${tag} (${clean(element.textContent, 20)})${placeOf(element)}`;
  };
  const lookOf = (element: Element, style: CSSStyleDeclaration): Look => {
    const rect = element.getBoundingClientRect();
    const borders = [...new Set(bordersOf(style))];
    return {
      background: style.backgroundColor,
      border: borders.join(" / "),
      color: style.color,
      cursor: style.cursor,
      font: `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.letterSpacing}`,
      h: Math.round(rect.height),
      opacity: style.opacity,
      outline:
        style.outlineStyle === "none"
          ? "none"
          : `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor} ${style.outlineOffset}`,
      radius: style.borderRadius,
      shadow: style.boxShadow,
      w: Math.round(rect.width),
      x: Math.round(rect.left - origin.left),
      y: Math.round(rect.top - origin.top),
    };
  };

  const seen = new Map<string, number>();
  const screen: Screen = {};
  for (const element of phone.querySelectorAll("*")) {
    const style = getComputedStyle(element);
    const shown =
      element.hasAttribute("aria-label") ||
      ownText(element) !== "" ||
      drawnTags.has(element.tagName.toLowerCase()) ||
      hasBox(style);
    if (unseen(element, style) || !shown) {
      continue;
    }
    const name = nameOf(element);
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    screen[count > 1 ? `${name} #${count}` : name] = lookOf(element, style);
  }
  return screen;
}
/* oxlint-enable unicorn/consistent-function-scoping */
