import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";

// Sheet headings, in the two kinds the platforms' own sheets have. A sheet
// to look at has its title and a × to close it. A sheet to decide
// something in has キャンセル, its title and the action, as iOS and Android
// put them. Menus and confirmations keep their own shape, with キャンセル
// at the bottom.

export function SheetHeading({
  title,
  eyebrow,
  onClose,
  onBack,
  children,
}: {
  title: ReactNode;
  // A small line above the title, like the month it is about.
  eyebrow?: ReactNode;
  onClose: () => void;
  // A step back inside the sheet, when it has more than one.
  onBack?: () => void;
  // Beside the title, like a tag.
  children?: ReactNode;
}) {
  return (
    <header className="ui-sheet-heading">
      {onBack && (
        <button
          aria-label="戻る"
          className="ui-sheet-back"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
      )}
      <div className="ui-sheet-title">
        {eyebrow && <p>{eyebrow}</p>}
        <div className="ui-sheet-title-row">
          <h4>{title}</h4>
          {children}
        </div>
      </div>
      <button
        aria-label="閉じる"
        className="ui-sheet-close"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={20} />
      </button>
    </header>
  );
}

export function DecideHeading({
  title,
  action,
  onCancel,
  onAction,
  disabled = false,
}: {
  title: ReactNode;
  action: string;
  onCancel: () => void;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="ui-sheet-heading ui-sheet-heading-decide">
      <button className="ui-sheet-cancel" onClick={onCancel} type="button">
        キャンセル
      </button>
      <h4>{title}</h4>
      <button
        className="ui-sheet-action"
        disabled={disabled}
        onClick={onAction}
        type="button"
      >
        {action}
      </button>
    </header>
  );
}
