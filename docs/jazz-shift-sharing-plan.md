# Jazz 2 シフト共有 実装計画

## 目的

現在のローカル前提のシフト管理を、Jazz 2 のクラウド同期と row-level permissions に載せて、各ユーザーが自分のシフトを共有できるようにする。

第一目標は「1つのグループに1つの共同編集シフト表を作る」ことではない。各自が自分のシフトを入力し、共有グループ内でお互いの予定を見て、休みが合う日を確認できる状態を作る。

代理入力、他人のシフト修正、病棟単位の公式シフト表は後回しにする。

## 前提

- このプロジェクトは Jazz 2 の `schema as s` / `s.table` / `s.defineApp` API を使っている。
- classic Jazz の `Group.create()` や `createInviteLink()` 前提では設計しない。
- クラウド同期は Jazz Cloud を使う。
- 招待 token の発行や検証は、必要になったら Expo API Routes などの自前サーバーで行う。
- 共有グループは「閲覧範囲」であり、共同編集シフト表ではない。
- 共有グループは公開コミュニティではなく、LINEグループのような仲間内の共有を想定する。
- MVPでは admin / owner / role の概念を持たない。グループ所属者は全員、招待と表示名変更ができる。
- 勤務メンバーは、当面は自分のシフト詳細に付ける補助情報として扱う。
- この計画は [勤務パターン休み判定 リファクタリング計画](./pattern-day-off-refactor-plan.md) を先に完了し、`patterns.countsAsDayOff` が使える状態になっている前提で進める。

## 用語

- `shareGroup`: シフトを見せ合う範囲。友達グループ、同期、職場の仲間などに相当する。
- `shareGroupMembers`: Jazz user がその shareGroup に所属していることを表す membership。
- `shifts`: 各ユーザーが所有する自分の勤務予定。
- `members`: 自分の勤務詳細に付ける勤務メンバー名簿。共有グループのメンバーとは別物。

## 推奨データモデル

`src/schema.ts` に personal shift sharing のための table を追加する。`patterns.countsAsDayOff` は事前リファクタリングで追加済みとする。

```ts
shareGroups: s.table({
  name: s.string(),
}),

shareGroupMembers: s.table({
  groupId: s.ref("shareGroups"),
  user_id: s.string(),
  displayName: s.string(),
}),

patterns: s.table({
  name: s.string(),
  emoji: s.string(),
  orderIndex: s.int(),
  countsAsDayOff: s.boolean(),
  isAllDay: s.boolean(),
  startDate: s.timestamp().optional(),
  endDate: s.timestamp().optional(),
  nextDayPatternId: s.ref("patterns").optional(),
}),

shifts: s.table({
  patternId: s.ref("patterns"),
  startDate: s.timestamp(),
  notes: s.string().optional(),
  memberIds: s.array(s.ref("members")),
}),

members: s.table({
  name: s.string(),
  orderIndex: s.int(),
}),
```

### 既存 schema からの変更点

- `teams` ではなく `shareGroups` として、共有範囲を表す。
- `patterns`, `members`, `shifts` は Jazz の magic column `$createdBy` で所有者を判定する。MVPでは明示的な `ownerUserId` は持たない。
- `shifts.memberIds` は既存の意味を維持する。これは「その日に一緒に働く勤務メンバー」であり、共有グループのメンバーとは別物。
- 共有は shift 単位ではなく、shareGroup membership 単位にする。自分が所属する shareGroup のメンバーには、自分の全 shift を見せる。
- `patterns.countsAsDayOff` は事前リファクタリング済みの前提で使う。
- メモを共有したくない場合は、後で `shiftPrivateNotes` に分離する。MVPでは既存の `shifts.notes` を残してもよいが、共有相手にも見える点に注意する。
- 代理入力や公式シフト表を後で作る場合は、`$createdBy` とは別に「誰の勤務か」を表す `subjectUserId` や `ownerMemberId` を追加する。

## 権限モデル

`src/permissions.ts` を作成し、`s.definePermissions(app, ...)` で明示的に許可する。

基本方針:

- 各ユーザーは自分の `patterns`, `members`, `shifts` を作成・編集できる。
- shareGroup member は、同じ group に所属するユーザーの shift を読める。
- shareGroup member は、同じ group に所属するユーザーの pattern も読める。
- 他人の shift は編集できない。
- shareGroup member は、同じ group に他のユーザーを招待できる。
- shareGroup member は、自分の `displayName` を変更できる。
- MVPでは group admin は作らない。

概念例:

```ts
const isShareGroupMember = (groupId: string) =>
  policy.shareGroupMembers.exists.where({
    groupId,
    user_id: session.user_id,
  });

const isUserInSameShareGroup = (createdBy: string) =>
  policy.shareGroupMembers.exists.where((ownerMembership) =>
    allOf([
      { user_id: createdBy },
      policy.shareGroupMembers.exists.where({
        groupId: ownerMembership.groupId,
        user_id: session.user_id,
      }),
    ])
  );
```

`shifts` の考え方:

```ts
policy.shifts.allowRead.where((shift) =>
  anyOf([
    { $createdBy: session.user_id },
    isUserInSameShareGroup(shift.$createdBy),
  ])
);

policy.shifts.allowInsert.where({ $createdBy: session.user_id });
policy.shifts.allowUpdate.where({ $createdBy: session.user_id });
policy.shifts.allowDelete.where({ $createdBy: session.user_id });
```

`patterns` は自分のもの、または読める shift から参照されているものを読めるようにする。

```ts
policy.patterns.allowRead.where((pattern) =>
  anyOf([
    { $createdBy: session.user_id },
    isUserInSameShareGroup(pattern.$createdBy),
  ])
);

policy.patterns.allowInsert.where({ $createdBy: session.user_id });
policy.patterns.allowUpdate.where({ $createdBy: session.user_id });
policy.patterns.allowDelete.where({ $createdBy: session.user_id });
```

`members` は当面、自分だけの補助名簿にする。

```ts
policy.members.allowRead.where({ $createdBy: session.user_id });
policy.members.allowInsert.where({ $createdBy: session.user_id });
policy.members.allowUpdate.where({ $createdBy: session.user_id });
policy.members.allowDelete.where({ $createdBy: session.user_id });
```

`shareGroupMembers` は、同じ group の member が読める。insert は招待 accept 時に許可する。表示名は本人だけ更新できる。

```ts
policy.shareGroupMembers.allowRead.where((member) =>
  isShareGroupMember(member.groupId)
);

policy.shareGroupMembers.allowInsert.where((member) =>
  validInviteFor(member.groupId)
);

policy.shareGroupMembers.allowUpdate.where({ user_id: session.user_id });
policy.shareGroupMembers.allowDelete.where({ user_id: session.user_id });
```

`validInviteFor` は概念上の関数。MVPでは user_id 直接追加で検証し、招待URLを実装する段階で `shareGroupInvites` と API Route に置き換える。

招待作成は、同じ group の member なら誰でもできる。

```ts
policy.shareGroupInvites.allowInsert.where((invite) =>
  isShareGroupMember(invite.groupId)
);
```

実装時は `whereOld` / `whereNew` を使い、更新後に `groupId`, `user_id` などを不正に差し替えられないようにする。

## 共有の考え方

各ユーザーは自分のカレンダーを持つ。共有グループは「所属メンバー同士がお互いの全 shift を見られる範囲」になる。

休みが合う日を見る画面では:

1. 現在の `shareGroup` を選ぶ。
2. その group の `shareGroupMembers` を読む。
3. 各 member の `user_id` と一致する `$createdBy` の `shifts` を読む。
4. `pattern.countsAsDayOff` や `pattern.name` を使って、日付ごとに誰が休みかを集計する。

この方式なら、グループごとに1つの公式シフト表を作らなくても、各自の予定を見せ合える。

## 同期設定

`src/app/_layout.tsx` の `JazzProvider` に `serverUrl` を追加する。

```tsx
<JazzProvider
  config={{
    appId: process.env.EXPO_PUBLIC_JAZZ_APP_ID!,
    secret,
    serverUrl: process.env.EXPO_PUBLIC_JAZZ_SERVER_URL!,
  }}
>
```

`.env` の想定:

```txt
EXPO_PUBLIC_JAZZ_APP_ID=...
EXPO_PUBLIC_JAZZ_SERVER_URL=https://v2.sync.jazz.tools/
```

permissions は Jazz Cloud に deploy する必要がある。

```sh
bunx jazz-tools@alpha deploy <app-id> \
  --server-url https://v2.sync.jazz.tools/ \
  --admin-secret <admin-secret>
```

## 初期フロー

MVP では招待を後回しにし、まず自分のデータをクラウド同期できる状態にする。

1. `useSession()` で `session.user_id` を取得する。
2. 自分の `patterns`, `members`, `shifts` を作る。所有者は Jazz が `$createdBy` に記録する。
3. 既存画面はまず自分のデータだけを表示・編集する。
4. 共有グループを作成する。
5. `shareGroupMembers` に自分を追加する。
6. グループ画面で、同じ group に所属する他人の shift を読む。

## UI 変更方針

最初に作るUI:

- 自分のシフト入力
- 自分の勤務パターン管理
- 自分の勤務メンバー管理
- 共有グループ作成
- グループ内の休み合わせ確認画面
- グループ名変更
- グループ内での自分の表示名変更

後回しにするUI:

- 招待リンク作成
- 招待受け入れ画面
- 代理入力
- 代理入力者による他人のシフト修正
- 公式な共同編集シフト表

既存画面の修正では、まず `$createdBy` scoped query に変える。

```ts
const patterns = useAll(app.patterns.where({ $createdBy: session.user_id })) ?? [];
const members = useAll(app.members.where({ $createdBy: session.user_id })) ?? [];
const shifts = useAll(app.shifts.where({ $createdBy: session.user_id })) ?? [];
```

### グループタブ

グループタブの最初の画面は、参加中のグループ一覧にする。

- 参加中の `shareGroups` をリスト表示する。
- 右上または画面下部に新規追加ボタンを置く。
- グループ行を押すとグループ詳細画面へ遷移する。
- グループ行にはグループ名と参加人数を表示する。

### グループ追加/編集

グループ追加/編集は、まずダイアログまたはモーダルでよい。

- グループ名を入力する。
- そのグループ内での自分の表示名を入力する。
- 新規作成時は `shareGroups` を作り、同時に自分の `shareGroupMembers` を作る。
- 既存グループ編集時は `shareGroups.name` と自分の `shareGroupMembers.displayName` を更新する。
- LINEグループ型の運用なので、グループ名変更は所属メンバー全員ができる想定にする。

### グループ詳細

グループ詳細は、休み合わせを確認するための表形式にする。

- 行は日付。
- 列は `shareGroupMembers.displayName`。
- 左上に現在の月を表示する。
- 各マスにはその人のシフト名、または未設定表示を出す。
- 参加人数が多い場合に備えて、横スクロールできるようにする。
- 月をまたいで前後にスクロールできるようにし、過去・未来を連続的に見られるようにする。
- 全員が休日の行をハイライトする。

全員休日の判定:

- `pattern.countsAsDayOff === true` は休日扱い。
- シフト未設定も休日扱い。
- 全員が休日扱いなら、その日付行をハイライトする。

`countsAsDayOff` は `isAllDay` と独立している前提。例えば「明け」は終日表示で `countsAsDayOff: true` にできるし、「待機」は終日表示でも `countsAsDayOff: false` にできる。

グループ画面では、`shareGroupMembers` から group の user_id 一覧を取得し、それぞれの `$createdBy` の shift を表示する。クエリ形は Jazz 2 の `where` / join 相当の表現に合わせて実装時に確認する。

## 招待機能

招待は MVP 後に追加する。

### 推奨方式

別DBは持たず、Jazz Cloud 上に `shareGroupInvites` table を追加する。

```ts
shareGroupInvites: s.table({
  groupId: s.ref("shareGroups"),
  tokenHash: s.string(),
  createdBy: s.string(),
  revoked: s.boolean(),
  usedAt: s.timestamp().optional(),
  expiresAt: s.timestamp().optional(),
}),
```

raw token は API Route が一度だけ返す。Jazz Cloud には hash のみ保存する。

招待URL:

```txt
nurseshift://invite#inviteId=...&token=...
```

secret は `#` 以降に置く。path や query に入れるとサーバーログに残る可能性がある。

### API Routes

Expo API Routes で作る想定:

```txt
app/api/share-groups/[groupId]/invites+api.ts
  POST: group member が招待リンクを作る

app/api/invites/accept+api.ts
  POST: token を検証し、shareGroupMembers を作る
```

API Route は `JAZZ_BACKEND_SECRET` または `JAZZ_ADMIN_SECRET` を持ち、Jazz Cloud に backend 権限で接続する。招待作成時は、リクエストした user が対象 group の member であることを確認する。

クライアントには backend/admin secret を絶対に置かない。

## 複数グループ対応

同じ Jazz user が複数の `shareGroup` に所属できる。

```txt
user_123
  同期グループ displayName = "佐藤"
  旅行メンバー displayName = "さとう"
```

グループごとに表示名を変えたい場合は `shareGroupMembers.displayName` を使う。

自分のカレンダーは `$createdBy: session.user_id` の shift を表示する。グループ画面は、その group に所属する全員の shift を表示する。

## 代理入力について

代理入力は MVP では作らない。

後で作る場合は、2つの方向がある。

1. 代理入力者が他人の `shifts` を作れるようにする。
2. `draftShifts` や `shiftRequests` を作り、本人が承認して自分の `shifts` に取り込む。

第一目標が「休みが合う日を確認する」ことなら、まずは本人入力だけで十分。

## 実装ステップ

### Phase 0: 勤務パターンの休み判定を整理する

- [勤務パターン休み判定 リファクタリング計画](./pattern-day-off-refactor-plan.md) を先に実施する。
- `patterns.isHoliday` を `patterns.countsAsDayOff` にリネームする。
- 休み合わせ判定を `countsAsDayOff` で行える状態にする。

### Phase 1: 自分のデータを `$createdBy` 前提にする

- 既存 query を `$createdBy` で絞る。
- insert は追加 owner column を入れず、Jazz の `$createdBy` に任せる。
- `src/permissions.ts` を追加し、自分のデータだけ read/write できるようにする。

### Phase 2: クラウド同期

- `JazzProvider` に `serverUrl` を追加する。
- `.env` に `EXPO_PUBLIC_JAZZ_SERVER_URL` を追加する。
- permissions を Jazz Cloud に deploy する手順を README か docs に残す。

### Phase 3: 共有グループ

- `shareGroups`, `shareGroupMembers` を追加する。
- 共有グループ作成UIを作る。
- グループ所属メンバーの shift を読める画面を作る。
- グループ内の shift を日付別に集計する画面を作る。

### Phase 4: 招待

- `shareGroupInvites` を schema に追加する。
- Expo API Routes で invite 作成/accept を実装する。
- deep link の `/invite` 画面を作る。

### Phase 5: 拡張

- メモを `shiftPrivateNotes` に分離する。
- 共有範囲を「全 shift」以外にする必要が出たら、月単位や shift 単位の共有 table を追加する。
- 代理入力や承認フローを検討する。

## 未決事項

- メモを共有するか、最初から個人用に分離するか。
- 将来的に shift 単位や月単位の公開範囲が必要になるか。
- グループごとの表示名を `shareGroupMembers.displayName` だけで十分とするか。
- 休み判定は `patterns.countsAsDayOff` で十分か、勤務区分を別途持つか。
- 招待なしの検証時に、user_id をどうやって交換するか。

## 推奨MVP

最初の完成ラインは以下にする。

- 自分の `patterns`, `members`, `shifts` が Jazz Cloud に同期される。
- 自分の shift だけ作成・編集・削除できる。
- 共有グループを作れる。
- 共有グループに所属している相手には、自分の全 shift が見える。
- 同じ共有グループのユーザーの shift を読める。
- グループ画面で「休みが合う日」を確認できる。
- 招待URLはまだ作らず、開発中は user_id を直接 `shareGroupMembers` に追加して検証する。
