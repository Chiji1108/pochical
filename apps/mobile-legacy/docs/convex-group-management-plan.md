# Convex グループ管理 導入計画

## 目的

シフト共有グループ、メンバー管理、招待リンク、将来のチャットと通知を Convex に寄せる。

Jazz は個人のシフト入力と同期に集中させる。Convex はオンライン前提の協調機能を担当する。

## 採用方針

Convex を次のデータの source of truth にする。

- 共有グループ
- 共有グループ membership
- 招待 code / 招待リンク
- チャットメッセージ
- 未読/既読
- push token
- 通知設定

Jazz は次のデータの source of truth のままにする。

- `patterns`
- `shifts`
- `members`
- `dayNotes`

共有画面では、Convex の membership から Jazz user id を取得し、その user id を使って Jazz のシフトを読む。

Apple / Google ログインは初回利用やチャット利用の必須条件にしない。ログインは「バックアップ/復元」「機種変更」「複数端末」のための optional account linking として見せる。

MVP では Jazz local-first auth の `session.user_id` を Convex の `jazzUserId` として使い、身内グループ前提で運用する。

## 判断理由

グループ管理と招待はローカルファーストの価値が薄い。

招待リンク発行、参加、脱退、チャット通知はオンライン前提であり、サーバー側で一貫して処理できる方が自然。

チャット導入後は `sendMessage` mutation で membership 検証、メッセージ保存、未読更新、push 通知を同じ Convex backend で扱いたい。そのため membership も Convex に置く。

Jazz 側の `shareGroups` / `shareGroupMembers` を SoT にしたまま Convex チャットを足すと、membership の二重管理と同期ズレが起きやすい。

## 最終構成

```txt
Expo app
  - JazzProvider: 個人シフト同期
  - ConvexProvider: グループ、招待、チャット、通知

Convex
  - groups
    - inviteCode
  - groupMembers
  - chatMessages
  - chatReads
  - pushTokens
  - notificationSettings

Jazz
  - patterns
  - shifts
  - members
  - dayNotes
```

## Convex schema/functions の管理場所

Convex schema/functions は Expo repo 側で管理する。

```txt
pochical/
  convex/
    schema.ts
    groups.ts
    invites.ts
    chat.ts
    notifications.ts
    http.ts
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

Next.js 側で必要なのは invite landing page の `groupName` 程度なので、repo 間で Convex generated API 型を共有しない。型共有 package は作らず、HTTP action の JSON contract で十分とする。

## Convex データモデル案

### user identity

当面は Convex に `users` table を作らない。

`jazzUserId` は Jazz の `session.user_id` と同じ値を使う。Convex functions は args の `jazzUserId` を user identity として扱い、`groupMembers.jazzUserId` と Jazz の `$createdBy` を突合キーにする。

これは強い認証境界ではなく、身内利用と開発中の割り切りである。バックアップ/復元を実装するタイミングで、`users` table、Convex Auth、外部 auth provider、Jazz account recovery の組み合わせを再検討する。それまでは Apple / Google ログインを要求しない。

### `groups`

```ts
{
  name: string;
  inviteCode: string;
  createdBy: string; // jazzUserId
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}
```

MVP では owner/admin/role を持たない。身内の LINE グループに近い運用として、現在メンバーならグループ名変更、招待リンク共有、メンバー削除をすべて実行できる。

`inviteCode` は URL に載る公開参加 ID。秘匿情報として扱わない。短い方が扱いやすいため、8から10文字程度にする。

手入力しやすくするため、文字種は紛らわしい文字を除いた英数字に限定する。

```txt
ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789
```

`inviteCode` は group 作成時に生成し、衝突したら再生成する。

`createdBy` は監査と将来の拡張用に残すが、権限判定には使わない。

必要な index:

- `by_inviteCode`: invite landing / preview / join で group を引く。

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

招待リンクは group 作成時に一度だけ生成し、再発行しない。無効化したい場合は group を archive する。将来、招待リンクの再発行や停止が必要になった時点で別設計として検討する。

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
  - 短い `inviteCode` を生成する。
  - `groups` を作成する。
  - 作成者を `groupMembers` に current member として追加する。
  - 既存 Jazz の `shareGroups` 作成は行わない。

- `groups.listForCurrentUser({ jazzUserId })`
  - current membership のある group 一覧を返す。
  - `inviteUrl` も返す。招待ボタン押下時に追加 round-trip が発生しないようにする。
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

- `invites.preview({ inviteCode })`
  - `groups.by_inviteCode` で group を引く。
  - group archive を確認する。
  - `groupName` だけ返す。
  - メンバー一覧は返さない。

- `invites.join({ inviteCode, jazzUserId, displayName })`
  - `groups.by_inviteCode` で group を引く。
  - group archive を確認する。
  - 既存 current member なら displayName を更新して group を返す。
  - 新規なら `groupMembers` に追加する。
  - `groupId`, `groupName` を返す。

### HTTP actions

Next.js landing page から generated Convex API 型なしで invite preview を読むための HTTP action を用意する。

- `GET /invite-preview?inviteCode=<inviteCode>`
  - `invites.preview` と同じ検証を行う。
  - 成功時は `ok: true`, `groupName` だけを返す。
  - 無効時は `ok: false`, `reason` を返す。
  - `groupId`, member list, `createdBy` は返さない。

ユーザー向け文言では `reason` を出し分けず、「この招待リンクは無効です」にまとめる。

```ts
type InvitePreviewHttpResponse =
  | {
      ok: true;
      groupName: string;
    }
  | {
      ok: false;
      reason: "not_found" | "archived";
    };
```

Next.js はこの HTTP action だけを読む。Expo app は HTTP action ではなく Convex client の query/mutation を使う。

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

## 現行実装との照合

### Next.js repo

Next.js 側は同じ workspace の `chiji-tech/` にある。現在の実装は Next.js 16 App Router で、Nurse Shift 関連は次のファイルにまとまっている。

```txt
chiji-tech/
  src/app/pochical/page.tsx
  src/app/pochical/invite/[inviteId]/page.tsx
  src/app/pochical/api/invites/route.ts
  src/app/pochical/api/invites/[inviteId]/route.ts
  src/lib/pochical/invites.ts
```

現在の invite は `src/lib/pochical/invites.ts` が Upstash Redis に `groupId`, `groupName`, `expiresAt` を保存する。`POST /pochical/api/invites` が invite ID を発行し、`GET /pochical/api/invites/[inviteId]` と landing page が同じ Redis record を読む。

Convex 移行後はこの Redis invite store と API Routes を削除する。landing route は `/pochical/invite/[inviteCode]` に rename する。Next.js 側に Convex schema/functions や generated API 型は持ち込まない。

### Expo app

Expo 側は現在、Jazz の `shareGroups` / `shareGroupMembers` をグループ管理の SoT として使っている。

```txt
pochical/src/app/(tabs)/group.tsx
  - app.shareGroups / app.shareGroupMembers を読む
  - group 作成/編集/脱退を Jazz batch で行う
  - POST {EXPO_PUBLIC_INVITE_API_BASE_URL or EXPO_PUBLIC_INVITE_BASE_URL}/api/invites で invite を作る

pochical/src/app/invite/[inviteId].tsx
  - GET .../api/invites/[inviteId] で preview する
  - app.shareGroupMembers に insert/update して参加する

pochical/src/app/share-groups/[groupId].tsx
  - groupId は Jazz shareGroups id
  - Jazz membership から user_id を集める
  - Jazz shifts/patterns を $createdBy で local filter して表示する
```

`src/schema.ts` と `src/permissions.ts` にはまだ `shareGroups` / `shareGroupMembers` が残っている。これらは Convex group 画面と共有画面への切り替えが完了してから最後に削除する。

## Next.js 側の変更計画

既存の `docs/invite-link-nextjs-plan.md` と現行 `chiji-tech` 実装は Upstash Redis を使う MVP 方針で実装済み。Convex 導入後は Next.js 側を次の役割に変える。

### Next.js の役割

- `/pochical/invite/[inviteCode]` の landing / fallback ページ
- OGP 表示
- アプリ未インストール時の説明とストア導線
- Universal Links / Android App Links の受け皿
- invite preview のために Convex HTTP action を server-side fetch する consumer

### Next.js から外すもの

- Expo app 向け API Routes
- Upstash Redis での invite 保存
- Next.js API 内での invite ID 発行
- Next.js API 内での期限判定
- Next.js API 内での membership 作成
- `@upstash/redis` dependency
- landing/support page 上の Upstash Redis 前提の説明

これらは Convex functions に移す。

### API 方針

Next.js API は不要。

Expo app は招待 URL 取得、招待 preview、参加を Convex client で直接呼ぶ。

Next.js 側は `/pochical/invite/[inviteCode]` の Universal Link / landing / fallback だけを担当する。landing page でグループ名を表示するため、Next.js server component 側から Convex の invite preview HTTP action を読む。

Expo app 向けの互換 API は作らない。

Next.js から Convex を読む場合は、Expo repo 側の Convex HTTP action を `fetch` する。Next.js repo に Convex schema/functions や generated API 型は持ち込まない。

Next.js には Convex HTTP action の base URL だけを環境変数で渡す。

```txt
POCHICAL_CONVEX_HTTP_URL=https://<deployment>.convex.site
```

Next.js 側の fetch helper は local 型で JSON contract だけを定義する。

```ts
type InvitePreviewResponse =
  | {
      ok: true;
      groupName: string;
    }
  | {
      ok: false;
      reason: "not_found" | "archived";
    };
```

`groupId` は landing page に出さない。Expo app は Convex client の `invites.preview` / `invites.join` を直接呼ぶため、Next.js 経由で `groupId` を受け取らない。

### Landing page

`GET /pochical/invite/[inviteCode]` は Convex の invite preview を読み、以下を表示する。

- グループ名
- アプリで開くボタン
- アプリ未インストール時の fallback
- OGP

preview が無効なら「この招待リンクは無効です」と表示する。

現行 `chiji-tech/src/app/pochical/invite/[inviteId]/page.tsx` は `params: Promise<{ inviteId: string }>` の Next.js 16 形式。移行時に `chiji-tech/src/app/pochical/invite/[inviteCode]/page.tsx` へ rename し、`params: Promise<{ inviteCode: string }>` として扱う。`getStoredInvite` import は Convex HTTP fetch helper に置き換える。

### Next.js の具体作業

- `chiji-tech/src/lib/pochical/invites.ts` を Redis store から Convex HTTP preview fetch helper に置き換える、または `invite-preview.ts` のような読み取り専用 helper に分ける。
- `chiji-tech/src/app/pochical/invite/[inviteId]/page.tsx` を `chiji-tech/src/app/pochical/invite/[inviteCode]/page.tsx` に rename し、Convex preview helper を使う。
- `chiji-tech/src/app/pochical/api/invites/route.ts` を削除する。
- `chiji-tech/src/app/pochical/api/invites/[inviteId]/route.ts` を削除する。
- `chiji-tech/package.json` から `@upstash/redis` を削除する。
- `chiji-tech/src/app/pochical/page.tsx` の `TECH_BADGES` から `Upstash Redis` を外し、Convex に差し替える。
- `chiji-tech/src/app/pochical/page.tsx` のプライバシーポリシー文言を「招待リンクの発行と確認は Convex に保存する招待情報を使う」方針に更新する。署名付きトークンや期限付き招待前提の表現は削除する。

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
```

招待 URL の組み立ては Convex 側で行う。

```txt
INVITE_BASE_URL=https://chiji.tech/pochical
```

Apple / Google 連携は初回起動では要求しない。個人シフト入力、グループ作成、グループ参加、チャットは未連携でも使える。

ログイン導線は「アカウント登録」ではなく「バックアップと復元」として出す。

```txt
バックアップと復元
Apple または Google と連携すると、機種変更や再インストール後もシフトとグループを復元できます。
```

将来、荒らし対策や本人確認が必要になった場合だけ、特定機能または特定グループで連携必須にする。

### `src/app/(tabs)/group.tsx`

現在は Jazz の `shareGroups` / `shareGroupMembers` を読む。

移行後:

- `groups.listForCurrentUser` を読む。
  - `inviteUrl` も同時に受け取る。
- グループ作成は `groups.create` mutation。
- グループ名/表示名変更は Convex mutation。
- 脱退は `groups.leave` mutation。
- 招待 URL は `groups.listForCurrentUser` の戻り値を使う。
- QR と Share は返された URL を使う。

### `src/app/invite/[inviteCode].tsx`

現在は Next.js `GET /api/invites/:inviteId` で preview し、Jazz に membership を insert する。

移行後:

- `src/app/invite/[inviteId].tsx` を `src/app/invite/[inviteCode].tsx` に rename する。
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
- 共有画面ではまず既存実装に近い `select("$createdBy")` + local filter で切り替える。
- Jazz は `$createdBy` で絞り込みできるため、後でメンバー単位の子コンポーネント購読に分ける。

20人程度ならメンバー単位購読は現実的。1本で広く読むより、各購読を `$createdBy` と表示範囲で絞れるならメンバー単位の方がよい可能性が高い。初回 cutover では後回しにし、共有画面のコンポーネント構造だけ後で分けやすくしておく。

## Jazz 側の整理

Convex SoT 移行後、Jazz から以下を削除する。

- `shareGroups`
- `shareGroupMembers`

既に `shareGroupAccess` と `ownerUserId` は不要化している。残る Jazz tables は個人データだけにする。

```ts
patterns
shifts
dayNotes
members
```

permissions 方針:

- `patterns`, `shifts`, `members` は read を広めに許可する。
- update/delete は `$createdBy` の本人だけ。
- `dayNotes` は read/update/delete すべて `$createdBy` の本人だけ。
- insert は Jazz の実行時挙動に合わせて `always()` にする。

## 移行フェーズ

開発中のため旧 Jazz group / 旧 Upstash invite URL の互換は持たない。Phase 2 は 1 本の cutover としてまとめて実装する。

### Phase 1: Convex 基盤追加

- Convex project を作る。
- `convex/schema.ts` を追加する。
- `groups`, `groupMembers`, `invites` を実装する。
- `convex/http.ts` に Next.js landing 向け `GET /invite-preview` を実装する。
- Expo app に Convex provider を追加する。
- Expo app には `convex` package を追加し、通常の `convex/react` hooks を使う。
- Expo app に `EXPO_PUBLIC_CONVEX_URL` を設定する。
- Convex env に `INVITE_BASE_URL=https://chiji.tech/pochical` を設定する。
- `jazzUserId = session.user_id` を Convex calls に渡す方針で統一する。

この段階では UI はまだ Jazz group を使ってよい。

### Phase 2: Convex group/invite cutover

- `chiji-tech` に `POCHICAL_CONVEX_HTTP_URL` を設定する。
- `chiji-tech` に Convex HTTP preview fetch helper を追加する。
- `chiji-tech/src/app/pochical/invite/[inviteId]/page.tsx` を `chiji-tech/src/app/pochical/invite/[inviteCode]/page.tsx` に rename し、Convex HTTP preview に切り替える。
- 無効 invite は `notFound()` だけでなく dedicated invalid state を追加する。
- invalid state のユーザー向け文言は「この招待リンクは無効です」にする。
- `generateMetadata` も Convex preview を使う。無効 invite では汎用 metadata を返すか `notFound()` に寄せる。
- `chiji-tech/src/app/pochical/page.tsx` の技術バッジとプライバシー文言を Convex 前提に更新する。
- `chiji-tech/src/app/pochical/api/invites/route.ts` を削除する。
- `chiji-tech/src/app/pochical/api/invites/[inviteId]/route.ts` を削除する。
- `chiji-tech/src/lib/pochical/invites.ts` の Redis 書き込み処理を削除する。preview helper を別ファイルにした場合はファイルごと削除する。
- `chiji-tech/package.json` から `@upstash/redis` を削除し、lockfile を更新する。
- Next.js 側の `INVITE_BASE_URL` / Upstash env vars が Nurse Shift invite だけに使われているならデプロイ環境から外す。
- `src/app/(tabs)/group.tsx` を Convex group list に変更する。
- group create/update/leave/remove member/invite を Convex mutation に変更する。
- Jazz `shareGroups` / `shareGroupMembers` への書き込みを止める。
- 招待 URL は Convex `groups.listForCurrentUser` の `inviteUrl` から使う。
- `src/app/(tabs)/group.tsx` の `getInviteApiBaseUrl` と `POST /api/invites` 呼び出しを削除する。
- QR と Share は `groups.listForCurrentUser` が返す `inviteUrl` をそのまま使う。
- `EXPO_PUBLIC_INVITE_API_BASE_URL` は廃止する。
- 脱退後は membership が物理削除されるため、該当 group は一覧に表示されない。
- 現行 UI の member count/member chips は `groups.listForCurrentUser` が返す集約済み data で表示する。必要なら `groups.listMembers` query を追加する。
- group edit dialog は既存のまま使い、submit/leave の実装だけ Convex mutation に差し替える。
- `src/app/invite/[inviteId].tsx` を `src/app/invite/[inviteCode].tsx` に rename し、join を Convex `invites.join` に変更する。
- preview は Convex `invites.preview` query に変更する。
- 成功時は Convex group id で `/share-groups/[groupId]` へ遷移する。
- Jazz membership insert を削除する。
- 現行の `ownMembership` 判定は Jazz `shareGroupMembers` ではなく、Convex preview/join の戻り値または `groups.getForCurrentUser` で判定する。
- `src/app/share-groups/[groupId].tsx` は Convex group/members を読む。
- Jazz の shifts/patterns は member の `jazzUserId` で表示対象を決める。
- Jazz の `shareGroups` / `shareGroupMembers` 依存を削除する。
- 現行の `groupId` は Jazz id だが、切り替え後は Convex `Id<"groups">` 文字列として扱う。
- 現行の `member.user_id` 参照は `member.jazzUserId` に置き換える。
- 現行の `member.id` key は Convex member row id か `${groupId}:${jazzUserId}` に置き換える。

### Phase 3: Jazz schema cleanup

- Jazz schema から `shareGroups` / `shareGroupMembers` を削除する。
- permissions から share group 関連を削除する。
- `bunx jazz-tools@alpha validate` を通す。

既存データがある場合は、必要なら一時移行スクリプトで Jazz group を Convex group にコピーする。開発中データだけならリセットでもよい。

### Phase 4: 共有画面の購読最適化

- 初回 cutover 後、共有画面をメンバー単位購読に分割する。
- Jazz query は `$createdBy` と表示範囲で絞る。
- 20人程度の group を想定して、1本の広い購読より小さい購読を複数持つ構成を優先する。
- 実測して重い場合は月単位/表示範囲単位の購読粒度を調整する。

### Phase 5: チャット MVP

- `chatMessages` と `chatReads` を追加する。
- `/share-groups/[groupId]` に `schedule/chat` segmented tab を追加する。
- `chat.sendMessage`, `chat.listMessages`, `chat.markRead` を実装する。
- チャットの閲覧は現在の membership があるユーザーだけに許可する。脱退後の履歴閲覧は提供しない。
- 通知なしのチャットは価値が薄いため、push token 基盤と同じタイミングで進める。

### Phase 6: Push 通知

- Expo push token を取得して Convex `pushTokens` に保存する。
- `chat.sendMessage` から sender 以外の current members に通知する。
- 通知タップで `/share-groups/[groupId]?tab=chat` を開く。
- token 失効時は `disabledAt` を入れる。

### Phase 7: バックアップ/復元

- Apple / Google 連携、Convex Auth、外部 auth provider、Jazz account recovery のどれを使うか再検討する。
- `users` table と auth identity から `jazzUserId` を復元する mapping を設計する。
- 採用した auth 方針に合わせて Jazz account recovery と Convex user linking を同じ UI から実行する。
- 連携済みユーザーは auth identity から `jazzUserId` を復元できるようにする。
- 未連携ユーザーには、機種変更/再インストール時にグループやチャット参加状態を復元できないことを明示する。

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

### 未連携ユーザーの復元

Apple / Google 未連携ユーザーは `jazzUserId` と端末内 secret に依存する。

アプリ削除、端末紛失、機種変更では同じユーザーとして復元できない可能性がある。その場合は新しいユーザーとして招待リンクから再参加する。

この制約はログインを必須にしない代わりのトレードオフとして受け入れる。UI ではログインを「バックアップと復元」として案内する。

## 完了条件

- グループ作成、一覧、編集、脱退が Convex だけで動く。
- 招待 URL 取得、招待 preview、参加が Convex だけで動く。
- Next.js landing page が Convex invite preview を使う。
- Next.js invite API Routes と Upstash Redis invite store が削除されている。
- `chiji-tech/src/app/pochical/page.tsx` の技術バッジ/プライバシー文言が Convex 前提になっている。
- Expo app が Jazz `shareGroups` / `shareGroupMembers` を参照しない。
- Jazz schema から group tables を削除できる。
- 共有画面は Convex membership と Jazz shifts/patterns を組み合わせて表示できる。
- チャット導入時に同じ Convex membership を使って送信/閲覧/通知対象を判定できる。
- Apple / Google 連携なしでもグループ作成、参加、チャット、通知が動く。
- Apple / Google 連携はバックアップ/復元として追加できる設計になっている。

## 検証コマンド

Expo repo:

```sh
bun x ultracite check
bun x tsc --noEmit
bunx jazz-tools@alpha validate
```

Biome / Ultracite は lint と format の検証に使う。Convex generated API、`Id<"groups">`、mutation args、React props の型ズレは TypeScript の型チェックで見るため、cutover 実装後は `tsc --noEmit` も実行する。

Convex repo/files 追加後:

```sh
npx convex dev
npx convex deploy
```

Next.js repo:

```sh
bun run lint
bun run build
```

現行 `chiji-tech/package.json` には `typecheck` script がない。型チェックだけを明示的に走らせたい場合は、先に script を追加するか `bunx tsc --noEmit` を使う。
