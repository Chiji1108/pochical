import { css } from "@pochical/styled-system/css";

import { notices } from "../lib/notices";
import { PageHeader } from "./design-header";
import { List, ListRow } from "./design-list";

// ライセンス (spec/calendar.md, ライセンス): everything the app is built
// with from other projects, each opening its license. The apps list the
// packages their build resolves beside what design/ writes into them from
// other projects; the prototype, which has no build of theirs, shows the
// latter (lib/notices.ts, from `mise run gen`), as the apps draw them.
export function LicensesPage({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (name: string) => void;
}) {
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="ライセンス" />
      <List>
        {notices.map((notice) => (
          <ListRow
            key={notice.name}
            label={notice.name}
            onClick={() => {
              onOpen(notice.name);
            }}
          />
        ))}
      </List>
    </>
  );
}

const licenseText = css({
  color: "text.primary",
  margin: "0 16px",
  textStyle: "caption",
  userSelect: "text",
  whiteSpace: "pre-wrap",
});

// One of ライセンス's: its license's text under its name.
export function LicensePage({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const notice = notices.find((each) => each.name === name);
  return (
    <>
      <PageHeader back="ライセンス" onBack={onBack} title={name} />
      <p className={licenseText}>{notice?.text}</p>
    </>
  );
}
