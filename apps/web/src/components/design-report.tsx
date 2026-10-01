import { useContext, useState } from "react";
import { css } from "styled-system/css";

import { useUser } from "../lib/design-user-store";
import type { Member } from "./design-group-data";
import { ConfirmDialog, DecideHeading, Sheet } from "./design-sheet";
import { ToastContext } from "./design-toast";
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
  sends,
  onClose,
  onSend,
  onGone,
}: {
  // What is being reported, as the sheet names it: 〇〇のメッセージ, or
  // the member. Open while set.
  what?: string;
  // What goes to Pochical with the report, said plainly, so it is clear
  // nothing else of the chat does: このメッセージと前後の数件, or the
  // member's name and picture.
  sends: string;
  onClose: () => void;
  onSend: (reason: ReportReason) => void;
  // Once the sheet has gone: where blocking is offered.
  onGone?: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const close = () => {
    setReason(null);
    onClose();
  };
  return (
    <Sheet
      label="通報"
      onExitComplete={onGone}
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
            通報すると、{sends}がポチカルに送られます。相手には知らされません。
          </Note>
        </Section>
      </div>
    </Sheet>
  );
}

// Once a member or their message is reported, blocking them is offered
// at once, as Instagram and X do: whoever was upset by them is spared a
// second trip to their profile. Saying no is just as easy.
export function BlockOffer({
  member,
  onClose,
}: {
  // The member just reported; open while set.
  member?: Member;
  onClose: () => void;
}) {
  const blocked = useUser((state) => state.blocked);
  const setBlocked = useUser((state) => state.setBlocked);
  const toast = useContext(ToastContext);
  if (!member) {
    return null;
  }
  return (
    <ConfirmDialog
      action="ブロック"
      cancel="しない"
      message={`${member.name}もブロックしますか？メッセージが表示されなくなり、個人チャットも届かなくなります。相手には知らされません。`}
      onCancel={onClose}
      onConfirm={() => {
        setBlocked([...blocked, member.id]);
        toast(`${member.name}をブロックしました`);
        onClose();
      }}
      title="通報しました"
    />
  );
}

// Whether to offer blocking after a report: not for yourself, nor for
// someone already blocked.
export function offersBlock(member: Member | undefined, blocked: string[]) {
  return member !== undefined && !member.me && !blocked.includes(member.id);
}
