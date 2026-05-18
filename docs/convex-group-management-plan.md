# Convex グループ管理 導入計画

## 目的

シフト共有グループ、メンバー管理、招待リンク、将来のチャットと通知を Convex に寄せる。

Jazz は個人のシフト入力と同期に集中させる。Convex はオンライン前提の協調機能を担当する。

## 採用方針

Convex を次のデータの source of truth にする。

- 共有グループ
- 共有グループ membership
- 招待 ID / 招待リンク
- チャットメッセージ
- 未読/既読
- push token
- 通知設定

Jazz は次のデータの source of truth のままにする。

- `patterns`
- `shifts`
- `members`
- `shiftNotes`

共有画面では、Convex の membership から Jazz user id を取得し、その user id を使って Jazz のシフトを読む。

## 判断理由

グループ管理と招待はローカルファーストの価値が薄い。

招待リンク作成、期限切れ、無効化、参加、脱退、チャット通知はオンライン前提であり、サーバー側で一貫して処理できる方が自然。

チャット導入後は `sendMessage` mutation で membership 検証、メッセージ保存、未読更新、push 通知を同じ Convex backend で扱いたい。そのため membership も Convex に置く。

Jazz 側の `shareGroups` / `shareGroupMembers` を SoT にしたまま Convex チャットを足すと、membership の二重管理と同期ズレが起きやすい。

## 最終構成

```txt
Expo app
  - JazzProvider: 個人シフト同期
  - ConvexProvider: グループ、招待、チャット、通知

Convex
  - groups
  - groupMembers
  - invites
  - chatMessages
  - chatReads
  - pushTokens
  - notificationSettings

Jazz
  - patterns
  - shifts
  - members
  - shiftNotes
```

## Convex schema/functions の管理場所

Convex schema/functions は Expo repo 側で管理する。

```txt
nurse-shift/
  convex/
    schema.ts
    groups.ts
    invites.ts
    chat.ts
    notifications.ts
  src/
    app/
```

この Convex backend は Nurse Shift アプリのドメインロジックであり、Next.js landing site の付属物ではないため。

Next.js repo は同じ Convex deployment の consumer として扱う。Next.js repo には Convex schema/functions を置かない。

```txt
Expo repo
  - Convex schema/functions の owner
  - Expo app から Convex client で query/mutation を直接呼ぶ
  - Next.js landing page 向けの invite preview HTTP action も定義する

Next.js repo
  - Universal Link / landing / fallback ページのみ担当
  - Convex HTTP action を fetch して invite preview を表示する
  - Convex schema の生成型には依存しない
```

Next.js 側で必要なのは invite landing page の `groupName` と `expiresAt` 程度なので、repo 間で Convex generated API 型を共有しない。型共有 package は作らず、HTTP action の JSON contract で十分とする。

## Convex データモデル案

### `users`

Convex 側でアプリユーザーを扱うための最小テーブル。

```ts
{
  jazzUserId: string;
  createdAt: number;
  lastSeenAt?: number;
}
```

`jazzUserId` は Jazz の `session.user_id` と同じ値を保存する。以後、Convex と Jazz の突合キーはこの値に統一する。

### `groups`

```ts
{
  name: string;
  createdBy: string; // jazzUserId
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}
```

MVP では owner/admin/role を持たない。身内の LINE グループに近い運用として、現在メンバーならグループ名変更、招待作成、メンバー削除をすべて実行できる。

`createdBy` は監査と将来の拡張用に残すが、権限判定には使わない。

### `groupMembers`

```ts
{
  groupId: Id<"groups">;
  jazzUserId: string;
  displayName: string;
  joinedAt: number;
}
```

脱退は物理削除する。脱退後はシフト共有もチャット履歴も見られない。

membership row は「今このグループにいる人」の判定だけに使う。チャットも本格的な SNS 履歴ではなく、現在メンバーが最新の連絡を見るための機能として扱う。

### `invites`

```ts
{
  groupId: Id<"groups">;
  inviteIdHash: string;
  createdBy: string; // jazzUserId
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  maxUses?: number;
  usedCount: number;
}
```

URL に載せる `inviteId` は random token。DB には hash を保存する。MVP では平文保存でも動くが、最初から hash にしておく方がよい。

### `chatMessages`

将来導入用。

```ts
{
  groupId: Id<"groups">;
  authorJazzUserId: string;
  body: string;
  createdAt: number;
  deletedAt?: number;
}
```

削除は soft delete。通知や未読と整合させる。

### `chatReads`

```ts
{
  groupId: Id<"groups">;
  jazzUserId: string;
  lastReadMessageCreatedAt: number;
  updatedAt: number;
}
```

MVP は message id ではなく timestamp でもよい。厳密な順序が必要になったら message id に寄せる。

### `pushTokens`

```ts
{
  jazzUserId: string;
  expoPushToken: string;
  deviceId?: string;
  platform: "ios" | "android" | "web";
  createdAt: number;
  updatedAt: number;
  disabledAt?: number;
}
```

通知送信に失敗した token は `disabledAt` を入れて送信対象から外す。

## Convex functions 案

### group

- `groups.create({ name, displayName, jazzUserId })`
  - `groups` を作成する。
  - 作成者を `groupMembers` に current member として追加する。
  - 既存 Jazz の `shareGroups` 作成は行わない。

- `groups.listForCurrentUser({ jazzUserId })`
  - current membership のある group 一覧を返す。
  - メンバー数、直近チャット、未読数も後で同時に返せるようにする。

- `groups.updateName({ groupId, name, jazzUserId })`
  - current member であることを確認する。
  - member 全員が変更可能。

- `groups.leave({ groupId, jazzUserId })`
  - membership row を削除する。
  - 最後の member なら group を archive する。
  - push 通知対象から外れる。

- `groups.removeMember({ groupId, targetJazzUserId, jazzUserId })`
  - current member であることを確認する。
  - target の membership row を削除する。
  - 自分を target にした場合は `groups.leave` と同じ扱いにする。
  - 最後の member を削除した場合は group を archive する。
  - 誤操作防止の確認ダイアログは Expo app 側で出す。

- `groups.updateDisplayName({ groupId, jazzUserId, displayName })`
  - 自分の membership の表示名だけ更新する。

### invite

- `invites.create({ groupId, jazzUserId })`
  - current member であることを確認する。
  - random invite ID を生成する。
  - hash を保存する。
  - `https://chiji.tech/nurse-shift/invite/<inviteId>` を返す。

- `invites.preview({ inviteId })`
  - invite hash を引く。
  - 期限切れ、revoke、group archive を確認する。
  - `groupName`, `expiresAt` だけ返す。
  - メンバー一覧は返さない。

- `invites.join({ inviteId, jazzUserId, displayName })`
  - invite を検証する。
  - 既存 current member なら displayName を更新して group を返す。
  - 新規なら `groupMembers` に追加する。
  - `usedCount` を増やす。

- `invites.revoke({ inviteId or inviteRowId, jazzUserId })`
  - current member であることを確認する。
  - `revokedAt` を入れる。

### chat

後続フェーズで追加する。

- `chat.listMessages({ groupId, cursor })`
  - current member のみ読める。
  - pagination 対応。

- `chat.sendMessage({ groupId, body, jazzUserId })`
  - current member のみ送信できる。
  - message を insert。
  - sender 以外の current members を通知対象にする。
  - push action を schedule または直接 action 呼び出しする。

- `chat.markRead({ groupId, messageCreatedAt, jazzUserId })`
  - read cursor を更新する。

- `chat.deleteOwnMessage({ messageId, jazzUserId })`
  - 自分の投稿だけ soft delete。

## Next.js 側の変更計画

既存の `docs/invite-link-nextjs-plan.md` は Upstash Redis を使う MVP 方針だった。Convex 導入後は Next.js 側を次の役割に変える。

### Next.js の役割

- `/nurse-shift/invite/[inviteId]` の landing / fallback ページ
- OGP 表示
- アプリ未インストール時の説明とストア導線
- Universal Links / Android App Links の受け皿

### Next.js から外すもの

- Expo app 向け API Routes
- Upstash Redis での invite 保存
- Next.js API 内での invite ID 発行
- Next.js API 内での期限判定
- Next.js API 内での membership 作成

これらは Convex functions に移す。

### API 方針

Next.js API は不要。

Expo app は招待作成、招待 preview、参加を Convex client で直接呼ぶ。

Next.js 側は `/nurse-shift/invite/[inviteId]` の Universal Link / landing / fallback だけを担当する。landing page でグループ名を表示したい場合は、Next.js server component 側から Convex の invite preview を読む。

Expo app 向けの互換 API は作らない。

Next.js から Convex を読む場合は、Expo repo 側の Convex HTTP action を `fetch` する。Next.js repo に Convex schema/functions や generated API 型は持ち込まない。

### Landing page

`GET /nurse-shift/invite/[inviteId]` は Convex の invite preview を読み、以下を表示する。

- グループ名
- 有効期限
- アプリで開くボタン
- アプリ未インストール時の fallback
- OGP

preview が無効なら期限切れ/無効ページを返す。

## Expo app 側の変更計画

### provider 導入

`src/app/_layout.tsx` に Convex provider を追加する。

```txt
JazzProvider
  ConvexProvider
    App
```

または順序を逆にしてもよい。重要なのは、画面内で Jazz session と Convex hooks の両方を使えること。

環境変数:

```txt
EXPO_PUBLIC_CONVEX_URL=
EXPO_PUBLIC_INVITE_BASE_URL=https://chiji.tech/nurse-shift
```

### `src/app/(tabs)/group.tsx`

現在は Jazz の `shareGroups` / `shareGroupMembers` を読む。

移行後:

- `groups.listForCurrentUser` を読む。
- グループ作成は `groups.create` mutation。
- グループ名/表示名変更は Convex mutation。
- 脱退は `groups.leave` mutation。
- 招待作成は `invites.create` mutation。
- QR と Share は返された URL を使う。

### `src/app/invite/[inviteId].tsx`

現在は Next.js `GET /api/invites/:inviteId` で preview し、Jazz に membership を insert する。

移行後:

- preview は Convex `invites.preview`。
- 参加は Convex `invites.join` mutation。
- Jazz `shareGroupMembers` には書き込まない。
- 成功後は `/share-groups/<convexGroupId>` に遷移する。

### `src/app/share-groups/[groupId].tsx`

`groupId` は Convex group id に変わる。

移行後:

- Convex から group detail と current members を読む。
- `groupMembers[].jazzUserId` を使って Jazz の `shifts` / `patterns` を読む。
- 個人画面では Jazz query を `$createdBy` で絞る。
- 共有画面では短期的に `select("$createdBy")` + local filter を使うか、メンバー単位の子コンポーネント購読に分ける。

将来的に性能問題が出たら、メンバー別 subscription にする。

## Jazz 側の整理

Convex SoT 移行後、Jazz から以下を削除する。

- `shareGroups`
- `shareGroupMembers`

既に `shareGroupAccess` と `ownerUserId` は不要化している。残る Jazz tables は個人データだけにする。

```ts
patterns
shifts
shiftNotes
members
```

permissions 方針:

- `patterns`, `shifts`, `members` は read を広めに許可する。
- update/delete は `$createdBy` の本人だけ。
- `shiftNotes` は read/update/delete すべて `$createdBy` の本人だけ。
- insert は Jazz の実行時挙動に合わせて `always()` にする。

## 移行フェーズ

### Phase 1: Convex 基盤追加

- Convex project を作る。
- `convex/schema.ts` を追加する。
- `groups`, `groupMembers`, `invites` を実装する。
- Expo app に Convex provider を追加する。
- `jazzUserId = session.user_id` を Convex calls に渡す方針で統一する。

この段階では UI はまだ Jazz group を使ってよい。

### Phase 2: 招待を Convex 化

- Expo app の招待作成を Convex `invites.create` に切り替える。
- Expo app の招待 preview を Convex `invites.preview` に切り替える。
- Next.js landing page も Convex preview を使う。
- 既存 Next.js invite API / Upstash Redis 実装は削除する。
- Next.js に Expo app 向け invite API を作り直さない。

### Phase 3: Expo group 画面を Convex に切り替え

- `src/app/(tabs)/group.tsx` を Convex group list に変更する。
- group create/update/leave/remove member/invite を Convex mutation に変更する。
- Jazz `shareGroups` / `shareGroupMembers` への書き込みを止める。
- 脱退後は membership が物理削除されるため、該当 group は一覧に表示されない。

### Phase 4: 招待参加を Convex に切り替え

- `src/app/invite/[inviteId].tsx` の join を Convex `invites.join` に変更する。
- 成功時は Convex group id で `/share-groups/[groupId]` へ遷移する。
- Jazz membership insert を削除する。

### Phase 5: 共有シフト画面を Convex membership に切り替え

- `src/app/share-groups/[groupId].tsx` は Convex group/members を読む。
- Jazz の shifts/patterns は member の `jazzUserId` で表示対象を決める。
- Jazz の `shareGroups` / `shareGroupMembers` 依存を削除する。

### Phase 6: Jazz schema cleanup

- Jazz schema から `shareGroups` / `shareGroupMembers` を削除する。
- permissions から share group 関連を削除する。
- `bunx jazz-tools@alpha validate` を通す。

既存データがある場合は、必要なら一時移行スクリプトで Jazz group を Convex group にコピーする。開発中データだけならリセットでもよい。

### Phase 7: チャット MVP

- `chatMessages` と `chatReads` を追加する。
- `/share-groups/[groupId]` に `schedule/chat` segmented tab を追加する。
- `chat.sendMessage`, `chat.listMessages`, `chat.markRead` を実装する。
- チャットの閲覧は現在の membership があるユーザーだけに許可する。脱退後の履歴閲覧は提供しない。
- 通知なしのチャットは価値が薄いため、push token 基盤と同じタイミングで進める。

### Phase 8: Push 通知

- Expo push token を取得して Convex `pushTokens` に保存する。
- `chat.sendMessage` から sender 以外の current members に通知する。
- 通知タップで `/share-groups/[groupId]?tab=chat` を開く。
- token 失効時は `disabledAt` を入れる。

## 移行リスク

### group id が変わる

Jazz group id から Convex group id に変わる。URL の `/share-groups/[groupId]` は Convex id を受けるようになる。

開発中のため旧リンク互換は持たない。既存の Jazz group / invite データは破棄または手動リセットでよい。

### membership の二重管理を避ける

Jazz と Convex の両方へ membership を書く期間は作らない。切り替え時点で新規 group/membership は Convex のみに書く。

### 通知は権限管理と同じ SoT に依存する

push 通知対象は Convex `groupMembers` の現在の members から取る。Jazz membership を参照しない。

### Jazz read permission は緩めたまま

現方針ではシフト自体は強い機密ではない前提で、Jazz の `patterns`, `shifts`, `members` read を広めに許可している。

UI 上の表示範囲は Convex membership で制御する。これは完全な秘匿ではなく、プロダクト上の割り切りである。

## 完了条件

- グループ作成、一覧、編集、脱退が Convex だけで動く。
- 招待作成、招待 preview、参加が Convex だけで動く。
- Next.js landing page が Convex invite preview を使う。
- Expo app が Jazz `shareGroups` / `shareGroupMembers` を参照しない。
- Jazz schema から group tables を削除できる。
- 共有画面は Convex membership と Jazz shifts/patterns を組み合わせて表示できる。
- チャット導入時に同じ Convex membership を使って送信/閲覧/通知対象を判定できる。

## 検証コマンド

Expo repo:

```sh
bun x ultracite check
bun x tsc --noEmit
bunx jazz-tools@alpha validate
```

Convex repo/files 追加後:

```sh
npx convex dev
npx convex deploy
```

Next.js repo:

```sh
bun run lint
bun run typecheck
bun run build
```

実際の script 名は Next.js repo の `package.json` に合わせる。
