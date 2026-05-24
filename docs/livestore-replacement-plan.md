# InstantDB から LiveStore への置き換え計画

## 目的

現行の個人シフトデータ永続化を InstantDB から LiveStore に置き換える。置き換え後はアプリ内から `@instantdb/react-native` / `@instantdb/react-native-mmkv` / `db.useQuery` / `db.transact` / `db.useAuth` / `instant.schema.ts` / `instant.perms.ts` を撤去し、LiveStore の `LiveStoreProvider` / `useStore` / `useQuery` / synced events / SQLite state に統一する。

この計画での「完全置き換え」は InstantDB の撤去を指す。現行の Convex はグループ、招待、チャット、未読、presence の source of truth として残す。開発中のため既存データ互換は持たず、InstantDB データと Convex 開発データはリセット前提で一括切り替えする。Convex 側の `instantUserId` という識別子名も LiveStore 移行に合わせて `localUserId` へ rename する。

## 前提と判断

- LiveStore は client-centric local-first data layer で、SQLite と event sourcing を基盤にする。
- LiveStore の Expo 利用には New Architecture が必要。Expo SDK 56 は New Architecture 前提のため、この要件は満たしている。
- LiveStore の Expo 既存プロジェクト導入では `@livestore/devtools-expo`、`@livestore/adapter-expo`、`@livestore/livestore`、`@livestore/react`、`@livestore/sync-cf`、`@livestore/peer-deps`、`expo-sqlite` を導入する。
- LiveStore は認証/認可を内蔵しない。sync backend へは `syncPayload` で認証情報を渡し、backend 側で検証する。
- LiveStore は 0.3.1 時点で beta。API、client storage format、sync backend storage format の破壊的変更リスクがあるため、初期移行ではデータ復旧手段と kill switch を用意する。
- LiveStore は Expo Web 未対応のため、このアプリの web 動作を正式サポート対象にする場合は別途方針決定が必要。

参考:

- https://docs.livestore.dev/llms.txt
- https://docs.livestore.dev/getting-started/expo/
- https://docs.livestore.dev/reference/concepts/
- https://docs.livestore.dev/reference/events/
- https://docs.livestore.dev/reference/state/sqlite-schema/
- https://docs.livestore.dev/reference/state/sql-queries/
- https://docs.livestore.dev/reference/syncing/
- https://docs.livestore.dev/patterns/auth/
- https://docs.livestore.dev/evaluation/state-of-the-project/

## 現状

### InstantDB 関連

- `package.json`
  - `@instantdb/react-native`
  - `@instantdb/react-native-mmkv`
- `instant.schema.ts`
  - `$users`
  - `shiftPatterns`
  - `shifts`
  - `dayNotes`
  - `shiftMembers`
  - owner / pattern / member / next-day pattern links
- `instant.perms.ts`
  - owner write 制御
  - `shiftPatterns` / `shifts` / `shiftMembers` は authenticated user へ read を広めに許可
  - `dayNotes` は owner read
- `src/lib/instant.ts`
  - InstantDB 初期化
  - `useCurrentUserId`
  - `useOwnWorkData`
  - `usePatternById`
  - `Pattern` / `ShiftMember` / `Shift` / `DayNote` / `WorkData` 型
- `src/app/_layout.tsx`
  - `db.SignedIn` / `db.SignedOut`
  - guest sign-in bootstrap
- 書き込み箇所
  - `src/lib/work-data-actions.ts`
  - `src/lib/shift-pattern-presets.ts`
  - `src/components/pattern/*`
  - `src/components/shift/shift-detail-input-panel.tsx`
  - `src/components/pattern/pattern-list-view.tsx`

### Convex 関連

Convex は引き続き以下を担当する。

- グループ作成、招待、参加、退出
- グループメンバー管理
- チャット、既読、未読
- presence
- グループイベント

ただし、Convex schema と UI route 名には `instantUserId` が残る。LiveStore 移行とは別 phase で `localUserId` または `syncUserId` へ rename する。

## 移行方針

1. まず LiveStore を InstantDB と並行導入し、`src/livestore/*` に schema、queries、hooks、actions を集約する。
2. UI は `src/lib/work-store.ts` のような安定した境界から読み書きする形に寄せ、InstantDB 型や link shape を UI から切り離す。
3. LiveStore の state は InstantDB link graph をそのまま再現せず、SQLite に適した正規化テーブルで表す。
4. 書き込みは CRUD 命令ではなく、過去形の synced events に変換する。
5. `DELETE` 相当は原則 soft delete にする。LiveStore docs でも concurrency 対策として soft delete が推奨されているため、`deletedAt` を全主要テーブルに持たせる。
6. 既存 InstantDB データは移行しない。開発中のため、InstantDB と Convex の開発データをリセットして LiveStore 初期状態から開始する。
7. sync/auth は MVP では local-only または insecure token の開発構成で検証し、本番前に Convex または別認証基盤から JWT を発行して LiveStore sync backend で検証する。

## LiveStore データモデル案

### SQLite state tables

```ts
// src/livestore/schema.ts
export const tables = {
  appMeta: State.SQLite.table({
    name: "app_meta",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      localUserId: State.SQLite.text(),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
  shiftPatterns: State.SQLite.table({
    name: "shift_patterns",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      ownerId: State.SQLite.text(),
      name: State.SQLite.text(),
      emoji: State.SQLite.text(),
      startDate: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      endDate: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      isAllDay: State.SQLite.boolean({ default: false }),
      countsAsDayOff: State.SQLite.boolean({ default: false }),
      orderIndex: State.SQLite.integer({ default: 0 }),
      nextDayPatternId: State.SQLite.text({ nullable: true }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
  shiftMembers: State.SQLite.table({
    name: "shift_members",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      ownerId: State.SQLite.text(),
      name: State.SQLite.text(),
      orderIndex: State.SQLite.integer({ default: 0 }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
  shifts: State.SQLite.table({
    name: "shifts",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      ownerId: State.SQLite.text(),
      startDate: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      patternId: State.SQLite.text({ nullable: true }),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
  shiftAssignments: State.SQLite.table({
    name: "shift_assignments",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      ownerId: State.SQLite.text(),
      shiftId: State.SQLite.text(),
      memberId: State.SQLite.text(),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
  dayNotes: State.SQLite.table({
    name: "day_notes",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      ownerId: State.SQLite.text(),
      date: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      notes: State.SQLite.text(),
      deletedAt: State.SQLite.integer({
        nullable: true,
        schema: Schema.DateFromNumber,
      }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    },
  }),
};
```

### Index 方針

LiveStore の query performance は indexed column への `WHERE` と `LIMIT` が重要。以下を schema/migration で確保する。

- `shift_patterns(ownerId, deletedAt, orderIndex)`
- `shift_members(ownerId, deletedAt, orderIndex)`
- `shifts(ownerId, deletedAt, startDate)`
- `shift_assignments(shiftId, deletedAt)`
- `shift_assignments(memberId, deletedAt)`
- `day_notes(ownerId, deletedAt, date)`

LiveStore の `State.SQLite.table` API だけで複合 index を表現しづらい場合は、schema migration または raw SQL migration の可否を検証してから確定する。

### UI model

LiveStore 移行では InstantDB link shape との互換 adapter を作らない。UI 内部も SQLite state に合わせて `ownerId` / `patternId` / `memberIds` を扱う形に更新する。

- `Pattern.nextDayPattern` は `nextDayPatternId` と pattern lookup で解決する。
- `Shift.pattern` は `patternId` から解決する。
- `Shift.shiftMembers` は `shift_assignments` 由来の `memberIds` から解決する。
- `owner?: { id: string }` は廃止し、`ownerId` に統一する。

## Event 設計案

LiveStore のイベント名は過去形、versioned name にする。

### User / bootstrap

- `localUserInitialized`
  - `v1.LocalUserInitialized`
  - `{ localUserId: string; createdAt: Date }`

### Pattern

- `shiftPatternCreated`
- `shiftPatternUpdated`
- `shiftPatternDeleted`
- `shiftPatternOrderChanged`
- `shiftPatternNextDayLinked`
- `shiftPatternNextDayUnlinked`
- `shiftPatternPresetAdded`

`shiftPatternPresetAdded` は複数 pattern と next-day link を 1 intent として残す。materializer は複数 row を insert/update する。

### Member

- `shiftMemberCreated`
- `shiftMemberUpdated`
- `shiftMemberDeleted`
- `shiftMemberOrderChanged`

### Shift

- `shiftCreated`
- `shiftPatternChanged`
- `shiftDateChanged`
- `shiftDeleted`
- `shiftMemberAssigned`
- `shiftMemberUnassigned`

`shiftMemberAssigned` は duplicate assignment を作らない materializer にする。id は `${shiftId}:${memberId}` ではなく、event args に `assignmentId` を持たせるほうが後続変更に強い。

### Day note

- `dayNoteUpserted`
- `dayNoteDeleted`

空文字保存時は UI action 側で `dayNoteDeleted` に寄せる。

### Reset

- `ownPatternsDeleted`
- `ownDayNotesDeleted`
- `ownWorkDataDeleted`

現行の `deleteOwnPatterns` / `deleteOwnWorkData` に対応する。materializer では owner scope の row に `deletedAt` を入れる。

## Query / hooks 設計案

### ファイル構成

- `src/livestore/schema.ts`
  - tables、events、materializers、schema
- `src/livestore/adapter.ts`
  - `makePersistedAdapter`
  - sync backend 設定
- `src/livestore/queries.ts`
  - `ownWorkData$`
  - `patternById$`
  - `memberSchedules$`
- `src/livestore/hooks.ts`
  - `useCurrentUserId`
  - `useOwnWorkData`
  - `usePatternById`
- `src/livestore/actions.ts`
  - UI から呼ぶ mutation 関数
- `src/lib/work-store.ts`
  - UI から参照する永続化境界

### `useOwnWorkData`

LiveStore 版の `useOwnWorkData(userId, dateRange)` は SQLite state から必要な表示モデルを組み立てる。

- patterns: `ownerId = userId and deletedAt is null order by orderIndex`
- members: `ownerId = userId and deletedAt is null order by orderIndex`
- shifts: `ownerId = userId and startDate between range and deletedAt is null`
- dayNotes: `ownerId = userId and date between range and deletedAt is null`
- shift relation は raw SQL または computed query で組み立てる。

### `usePatternById`

`patternId` と `userId` を受け取り、`deletedAt is null` を必ず条件に入れる。

### グループシフト

現行では Convex membership の `instantUserId` を InstantDB owner id として使っている。LiveStore では storeId と user identity の設計が変わるため、次のどちらかを選ぶ。

1. 個人ごとに `storeId = localUserId` として同期し、グループメンバーの勤務表を読むには各メンバーの store を別 store として購読する。
2. グループ共有用に `storeId = group:${groupId}` の store を作り、共有対象シフトを group store に event として投影する。

推奨は 2。LiveStore の `storeId` は同期イベントの単位でもあるため、グループ共有は個人 store の全体公開より group store に寄せるほうが権限境界を作りやすい。

初期 scope では個人シフトの置換を先に完了し、グループシフト閲覧は read-only projection として後続 phase に分ける。

## Auth / identity 方針

InstantDB Guest Auth の代替として、端末内に `localUserId` を作る。

- `expo-secure-store` または LiveStore local state に `localUserId` を保持する。
- 初回起動時に `localUserInitialized` を commit する。
- Convex へ渡す user id も `localUserId` に rename する。
- 既存 Convex 開発データはリセットし、`instantUserId` から `localUserId` へのデータ移行は行わない。

sync を有効化する場合:

- `EXPO_PUBLIC_LIVESTORE_SYNC_URL` を追加する。
- client は `syncPayload` に JWT または Convex 由来の短命 token を渡す。
- Cloudflare Worker 側で token を検証し、許可された `storeId` だけ push/pull できるようにする。

LiveStore は認証/認可を内蔵しないため、InstantDB permissions と同等の server-side read/write 制御は sync backend の `validatePayload` と store partition 設計で代替する。

## 導入 Phase

### Phase 0: 技術検証

作業:

- Expo SDK 56 の New Architecture 前提で LiveStore Expo adapter の動作を確認する。
- `bun install @livestore/devtools-expo @livestore/adapter-expo @livestore/livestore @livestore/react @livestore/sync-cf @livestore/peer-deps expo-sqlite`
- `bun add -d babel-plugin-transform-vite-meta-env`
- `babel.config.js` に `babel-plugin-transform-vite-meta-env` と `@babel/plugin-syntax-import-attributes` を追加する。
- `metro.config.mjs` に LiveStore Devtools middleware を追加できるか確認する。現行が ESM config のため docs の CommonJS 例をそのまま貼らない。
- 最小 schema で Expo dev client が起動するか確認する。

受け入れ条件:

- iOS / Android dev client で LiveStoreProvider が mount できる。
- LiveStore Devtools を開ける。
- `store.commit` と `useQuery` が動く。
- `bun x ultracite check` が通る。

### Phase 1: LiveStore schema / provider 追加

作業:

- `src/livestore/schema.ts` を追加する。
- `src/livestore/adapter.ts` を追加する。
- `src/app/_layout.tsx` の AppShell 内に `LiveStoreProvider` を追加する。
- `localUserId` bootstrap を実装する。
- `src/lib/work-store.ts` を追加し、UI import を LiveStore hooks/actions へ集約する。

受け入れ条件:

- 既存 UI の import 境界が LiveStore 前提に寄る。
- LiveStore は空 store として初期化される。
- `localUserId` が生成され、Convex へ渡す準備ができる。

### Phase 2: Read model 移植

作業:

- `useOwnWorkData` と `usePatternById` の LiveStore 版を実装する。
- patterns / members / shifts / dayNotes を SQLite state 前提の UI model に合わせる。
- カレンダー、パターン詳細、メンバー一覧を LiveStore read に切り替える。

受け入れ条件:

- データリセット後の初期状態でカレンダー、パターン、メンバー画面が動く。
- 日付範囲 filter、pattern lookup、member assignment 表示が一致する。
- 空データ時の初期画面が壊れない。

### Phase 3: Write model 移植

作業:

- `src/livestore/actions.ts` に書き込み関数を実装する。
- `db.transact` 呼び出しを `store.commit(events.*)` に置き換える。
- pattern preset 追加は `shiftPatternPresetAdded` に寄せる。
- reset 系は soft delete event に寄せる。
- optimistic UI と rollback が必要な箇所を洗い出す。

受け入れ条件:

- シフト作成、編集、削除ができる。
- pattern 作成、編集、削除、並び替え、next-day link ができる。
- member 作成、編集、削除、並び替え、shift への assign/unassign ができる。
- day note 作成、編集、削除ができる。
- calendar export が LiveStore データで動く。

### Phase 4: InstantDB auth / schema / perms 撤去

作業:

- `src/lib/instant.ts` import をなくす。
- `src/app/_layout.tsx` から `db.SignedIn` / `db.SignedOut` / GuestBootstrap を削除する。
- `instant.schema.ts` / `instant.perms.ts` を削除する。
- `package.json` から InstantDB dependencies を削除する。
- `tsconfig.json` から InstantDB ファイル参照を削除する。
- `EXPO_PUBLIC_INSTANT_APP_ID` を不要にする。

受け入れ条件:

- `rg "@instantdb|instant.schema|instant.perms|db\\.transact|db\\.useQuery|db\\.useAuth"` が 0 件になる。ただし文書ファイルは除外してよい。
- clean install 後に dev client が起動する。
- `bun x ultracite check` が通る。

### Phase 5: Convex identifier rename

作業:

- Convex schema/API/UI の `instantUserId` を `localUserId` または `syncUserId` に rename する。
- route `[memberInstantUserId]` を `[memberLocalUserId]` へ rename する。
- chat metadata / unread / presence の型名を更新する。
- 開発データは reset 前提。Convex migration は作らない。

受け入れ条件:

- グループ作成、招待参加、設定変更、退出、メンバー削除が新しい identifier 名で動く。
- グループチャット、個別チャット、既読、presence が新しい identifier 名で動く。
- UI 文言に InstantDB 前提の表現が残らない。

### Phase 6: Sync backend / group store 設計

作業:

- local-only でよい範囲と cloud sync が必要な範囲を確定する。
- 個人 store と group store の storeId 命名規則を決める。
- Cloudflare Worker sync backend を用意する。
- `syncPayload` の token を Convex mutation で発行するか、別 auth provider から発行するか決める。
- group store への共有 projection event を設計する。

受け入れ条件:

- 別端末で同じ user/group store を同期できる。
- 権限のない user が storeId を推測しても sync backend に拒否される。
- offline 中に作成したシフトが再接続後に同期される。
- conflict 時の最終状態が materializer 仕様として説明できる。

## テスト計画

### Unit / logic

- materializer ごとの event replay test
- duplicate assignment の idempotency test
- soft delete 後に query へ出ないこと
- pattern preset の next-day link
- reset event の owner scope

### Integration

- `useOwnWorkData` date range
- `usePatternById`
- calendar export
- group invite / chat / presence は Convex 側 regression として確認

### Device QA

- iOS dev client
- Android dev client
- offline 起動
- offline 書き込み後の再起動
- sync 有効時の再接続
- LiveStore Devtools で eventlog と SQLite state 確認

## リスクと対策

### LiveStore beta 由来の破壊的変更

対策:

- LiveStore packages は exact version pin にする。
- EAS Update 前に dev client で storage format 変更の影響を確認する。
- `appMeta` に `schemaVersion` を持たせ、必要なら「アップデートが必要」画面を出す。

### InstantDB permissions 相当が消える

対策:

- ownerId filter は UI だけに頼らない。
- sync backend の token validation と storeId partition で read/write 境界を作る。
- group sharing は個人 store の広い read ではなく group store projection を使う。

### Event 設計を間違えると後から消せない

対策:

- CRUD ではなく domain intent を event にする。
- event name は `v1.*` で versioning する。
- optional/default field 追加で進化できる schema にする。
- 初期 phase では sync 無効で event shape を固める。

### UI model 変更の影響範囲が広い

対策:

- `src/lib/work-store.ts` を境界にし、画面ごとに read/write を切り替える。
- InstantDB link shape 互換は作らず、LiveStore の flat model に直接寄せる。

### グループシフト共有の設計が InstantDB より重い

対策:

- 個人データ移行と group sharing を別 phase にする。
- group store projection を採用し、共有対象だけを同期する。
- Convex membership を source of truth として、LiveStore sync auth に接続する。

## ロールバック方針

- 開発中かつデータリセット前提のため、データ互換 rollback は行わない。
- 問題が出た場合は Git revert で InstantDB 実装へ戻し、開発データを再作成する。
- Phase 4 までは InstantDB dependencies と schema/perms を残せるが、LiveStore 側へのデータ移行や書き戻しは実装しない。

## 完了条件

- InstantDB runtime dependency が `package.json` から消えている。
- `src/lib/instant.ts`、`instant.schema.ts`、`instant.perms.ts` が消えている。
- 個人シフト、パターン、勤務メンバー、日別メモの CRUD が LiveStore で動く。
- calendar export が LiveStore データで動く。
- Convex のグループ、招待、チャット、未読、presence が regression なしで動く。
- iOS / Android dev client で offline-first 動作を確認済み。
- `bun x ultracite check` が通る。
