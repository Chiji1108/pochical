// What the phones on a page show (or what else `root` names, like the
// samples on /design/components), measured in the page by Playwright: the
// phone itself and each element in it with text, a label, a box of its own
// or that is a control or icon, keyed by what it says or is labelled
// (counted when a name comes again), with where it sits in its phone and
// how it is drawn, along with what is drawn over it from beside it. With
// more than one phone, keys start with its number.

export type Look = Record<string, number | string>;
export type Screen = Record<string, Look>;

// Playwright sends this function into the page as its source, so its
// helpers have to live inside it.
/* oxlint-disable unicorn/consistent-function-scoping */
export function measure(root: string): Screen {
  const phones = [...document.querySelectorAll(root)];
  if (phones.length === 0) {
    throw new Error(`No ${root} on the page`);
  }
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
  const unseen = (
    element: Element,
    style: CSSStyleDeclaration,
    phone: Element
  ) => {
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
  // A ::before or ::after that draws something, like a day-off tile or a
  // picked day's frame, as how it is drawn: it has no box to measure, but
  // its insets, ground, edge and shadow say where and how it sits.
  const pseudoLook = (element: Element, which: "::before" | "::after") => {
    const style = getComputedStyle(element, which);
    if (style.content === "none" || style.content === "normal") {
      return null;
    }
    const look: Look = {
      background: style.backgroundColor,
      border: [...new Set(bordersOf(style))].join(" / "),
      content: style.content,
      height: style.height,
      inset: `${style.top} ${style.right} ${style.bottom} ${style.left}`,
      opacity: style.opacity,
      position: style.position,
      radius: style.borderRadius,
      shadow: style.boxShadow,
      transform: style.transform,
      width: style.width,
      zIndex: style.zIndex,
    };
    return look;
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
    if (tag === "img") {
      const src = element.getAttribute("src") ?? "";
      // A picture made in the page, like a photo just chosen, has a new
      // blob: or data: URL each load, so it goes by its kind; more than one
      // are counted in the order of the page.
      const made = /^(?<kind>blob|data):/u.exec(src)?.groups?.kind;
      const file = made ?? src.split("/").pop() ?? "";
      return `img ${file.slice(0, 40)}${placeOf(element)}`;
    }
    if (tag === "svg") {
      const icon =
        [...element.classList].find((item) => item.startsWith("lucide-")) ??
        "icon";
      return `svg ${icon}${placeOf(element) || ` in (${clean(element.parentElement?.textContent ?? null, 20)})`}`;
    }
    return `${tag} (${clean(element.textContent, 20)})${placeOf(element)}`;
  };
  const lookOf = (
    element: Element,
    style: CSSStyleDeclaration,
    origin: DOMRect
  ): Look => {
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

  const screen: Screen = {};
  // A sample on /design/components goes by the name it is listed under,
  // so adding one does not renumber the rest; phones go by their place.
  const rootNames = new Map<string, number>();
  const rootName = (measured: Element, index: number) => {
    const listed =
      measured.closest("[data-catalog-item]")?.querySelector("code")
        ?.textContent ?? "";
    if (listed === "") {
      return String(index + 1);
    }
    const count = (rootNames.get(listed) ?? 0) + 1;
    rootNames.set(listed, count);
    return count > 1 ? `${listed} #${count}` : listed;
  };
  for (const [index, phone] of phones.entries()) {
    const prefix = phones.length > 1 ? `${rootName(phone, index)} › ` : "";
    const origin = phone.getBoundingClientRect();
    screen[`${prefix}phone`] = lookOf(phone, getComputedStyle(phone), origin);
    const seen = new Map<string, number>();
    // What is drawn over the phone from beside it, like a sheet pictured
    // open over it in the flow diagrams.
    const overlays = [...(phone.parentElement?.children ?? [])].filter(
      (sibling) => {
        if (sibling === phone) {
          return false;
        }
        const box = sibling.getBoundingClientRect();
        return (
          box.left < origin.right &&
          box.right > origin.left &&
          box.top < origin.bottom &&
          box.bottom > origin.top
        );
      }
    );
    const elements = [
      ...phone.querySelectorAll("*"),
      ...overlays.flatMap((overlay) => [
        overlay,
        ...overlay.querySelectorAll("*"),
      ]),
    ];
    for (const element of elements) {
      const style = getComputedStyle(element);
      const pseudos = (["::before", "::after"] as const)
        .map((which) => [which, pseudoLook(element, which)] as const)
        .filter(([, look]) => look !== null);
      const shown =
        pseudos.length > 0 ||
        element.hasAttribute("aria-label") ||
        ownText(element) !== "" ||
        drawnTags.has(element.tagName.toLowerCase()) ||
        hasBox(style);
      if (unseen(element, style, phone) || !shown) {
        continue;
      }
      const name = nameOf(element);
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      const key = `${prefix}${count > 1 ? `${name} #${count}` : name}`;
      screen[key] = lookOf(element, style, origin);
      for (const [which, look] of pseudos) {
        if (look) {
          screen[`${key}${which}`] = look;
        }
      }
    }
  }
  return screen;
}
/* oxlint-enable unicorn/consistent-function-scoping */
