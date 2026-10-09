import { CloudCheck } from "lucide-react";
import { useState } from "react";
import { css } from "styled-system/css";

import { useSettings } from "../lib/design-settings-store";
import {
  ProviderButtons,
  ProviderLogo,
  providerNames,
  sampleEmails,
  signInMilliseconds,
} from "./design-account";
import type { AccountProvider } from "./design-account";
import { LimitedInput } from "./design-fields";
import type { Profile } from "./design-group-data";
import { PhotoEditor } from "./design-group-parts";
import { PageHeader } from "./design-header";
import { List, ListRow } from "./design-list";
import { settingsParts } from "./design-settings-parts";
import { ConfirmDialog } from "./design-sheet";
import { Note, Section } from "./design-ui";

// The account and the profile: what keeps someone's data, and the name and
// picture others see.

export function AccountRow({ onOpen }: { onOpen: () => void }) {
  const account = useSettings((state) => state.account);
  return (
    <ListRow
      label="アカウント"
      onClick={onOpen}
      value={
        account ? (
          <span className={settingsParts.inlineValue}>
            <ProviderLogo provider={account.provider} size={15} />
            {providerNames[account.provider]}
          </span>
        ) : (
          "ログインしていません"
        )
      }
    />
  );
}

// Before signing in, what it is for and the two ways in; after, who is
// signed in and the ways out. Signing in is optional, so the page never
// pushes it beyond saying what it keeps safe.
// Signed out, it says what signing in keeps and offers the two ways in;
// signed in, which account it is, and leaving or deleting it.
const accountPage = {
  delete: css({ marginTop: "12px" }),
  hero: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px 12px 24px",
    textAlign: "center",
  }),
  icon: css({
    bg: "accent.container",
    borderRadius: "circle",
    color: "accent.default",
    display: "grid",
    height: "56px",
    marginBottom: "8px",
    placeItems: "center",
    width: "56px",
  }),
  lead: css({
    color: "text.tertiary",
    lineHeight: 1.6,
    margin: 0,
    textStyle: "subheadline",
  }),
  logo: css({
    bg: "background.card",
    borderRadius: "circle",
    color: "text.primary",
    display: "grid",
    height: "30px",
    marginRight: "12px",
    placeItems: "center",
    width: "30px",
  }),
  title: css({
    color: "text.primary",
    fontWeight: 700,
    margin: 0,
    textStyle: "title3",
  }),
};

export function AccountPage({ onBack }: { onBack: () => void }) {
  const account = useSettings((state) => state.account);
  const setAccount = useSettings((state) => state.setAccount);
  const [busy, setBusy] = useState<AccountProvider>();
  const [confirm, setConfirm] = useState<"signOut" | "delete">();
  const signIn = (provider: AccountProvider) => {
    if (busy) {
      return;
    }
    setBusy(provider);
    setTimeout(() => {
      setAccount({ email: sampleEmails[provider], provider });
      setBusy(undefined);
    }, signInMilliseconds);
  };
  if (!account) {
    return (
      <>
        <PageHeader back="設定" onBack={onBack} title="アカウント" />
        <div className={accountPage.hero}>
          <span aria-hidden="true" className={accountPage.icon}>
            <CloudCheck size={28} />
          </span>
          <h4 className={accountPage.title}>ログインして、データを守る</h4>
          <p className={accountPage.lead}>
            機種変更しても、スマホとタブレットでも、同じシフトとグループを使えます。
          </p>
        </div>
        <ProviderButtons busy={busy} onPick={signIn} />
        <Note>
          はじめてなら、この端末のデータがそのまま引き継がれます。すでにアカウントがあれば、そのデータを開きます。ログインしなくても、この端末ではそのまま使えます。
        </Note>
      </>
    );
  }
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="アカウント" />
      <Section title="ログイン中">
        <List>
          <ListRow
            label={providerNames[account.provider]}
            value={account.email}
            leading={
              <>
                <span className={accountPage.logo}>
                  <ProviderLogo provider={account.provider} size={18} />
                </span>
              </>
            }
          />
        </List>
        <Note>
          シフトとグループはこのアカウントに保存され、ほかの端末でも同じデータを使えます。
        </Note>
      </Section>
      <List>
        {/* Asks first, on the spot, so no arrow as for a page. */}
        <ListRow
          onClick={() => {
            setConfirm("signOut");
          }}
          label="ログアウト"
          danger
        />
      </List>
      <List className={accountPage.delete}>
        {/* Asks first, on the spot, so no arrow as for a page. */}
        <ListRow
          onClick={() => {
            setConfirm("delete");
          }}
          label="アカウントを削除"
          danger
        />
      </List>
      {confirm === "signOut" && (
        <ConfirmDialog
          action="ログアウト"
          message="この端末からデータが消えます。もう一度ログインすれば、同じデータを使えます。"
          onCancel={() => {
            setConfirm(undefined);
          }}
          onConfirm={() => {
            setConfirm(undefined);
            setAccount(undefined);
          }}
          title="ログアウトしますか？"
        />
      )}
      {confirm === "delete" && (
        <ConfirmDialog
          action="アカウントとすべてのデータを削除"
          message="シフト、グループ、チャットがすべて削除されます。元に戻せません。"
          onCancel={() => {
            setConfirm(undefined);
          }}
          onConfirm={() => {
            setConfirm(undefined);
            setAccount(undefined);
          }}
          title="アカウントを削除しますか？"
        />
      )}
    </>
  );
}

// Your usual name and picture, which every group shows unless it has its
// own for you (spec/sync-protocol.md, Profile).
export function ProfilePage({
  profile,
  onChange,
  onBack,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onBack: () => void;
}) {
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="プロフィール" />
      <PhotoEditor
        name={profile.name}
        onRemove={
          profile.photo
            ? () => {
                onChange({ ...profile, photo: undefined });
              }
            : undefined
        }
        onUpload={(photo) => {
          onChange({ ...profile, photo });
        }}
        photo={profile.photo}
        size={88}
      />
      <List>
        <ListRow
          label="いつもの名前"
          control={
            <>
              <LimitedInput
                align="end"
                look="inline"
                kind="personName"
                onValueChange={(name) => {
                  onChange({ ...profile, name });
                }}
                placeholder="例：さくら"
                value={profile.name}
              />
            </>
          }
        />
      </List>
      <Note>
        グループでは、この名前と写真で表示されます。グループごとに違う名前や写真にしたいときは、各グループの設定で変えられます。
      </Note>
    </>
  );
}
