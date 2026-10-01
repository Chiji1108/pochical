import { useState } from "react";
import { css } from "styled-system/css";

import { DecideHeading, Sheet } from "./design-sheet";
import { ChoiceList, ChoiceRow, Note, Section } from "./design-ui";

// Telling Pochical about a message or a member, as the stores ask of an
// app where people post to each other (App Store 1.2, Google Play's user
// generated content policy): a reason, then sent. The member is not told,
// and nothing changes in the group; blocking is a separate step.

const reasons = [
  { label: "迷惑・スパム", value: "spam" },
  { label: "嫌がらせ・いじめ", value: "harassment" },
  { label: "性的・暴力的な内容", value: "explicit" },
  { label: "なりすまし", value: "impersonation" },
  { label: "その他", value: "other" },
] as const;

export type ReportReason = (typeof reasons)[number]["value"];

const body = css({
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  paddingBottom: "8px",
});

export function ReportSheet({
  what,
  onClose,
  onSend,
}: {
  // What is being reported, as the sheet names it: 〇〇のメッセージ, or
  // the member. Open while set.
  what?: string;
  onClose: () => void;
  onSend: (reason: ReportReason) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const close = () => {
    setReason(null);
    onClose();
  };
  return (
    <Sheet
      label="通報"
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open={what !== undefined}
    >
      <DecideHeading
        action="送信"
        disabled={reason === null}
        onAction={() => {
          if (reason) {
            onSend(reason);
            setReason(null);
          }
        }}
        onCancel={close}
        title="通報"
      />
      <div className={body}>
        <Section title={`${what ?? ""}を通報する理由`}>
          <ChoiceList
            label="通報する理由"
            onValueChange={setReason}
            value={reason}
          >
            {reasons.map((choice) => (
              <ChoiceRow
                key={choice.value}
                label={choice.label}
                value={choice.value}
              />
            ))}
          </ChoiceList>
          <Note>
            ポチカルの運営が内容を確認します。通報したことは相手に知らされません。
          </Note>
        </Section>
      </div>
    </Sheet>
  );
}
