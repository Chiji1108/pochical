# Jazz から InstantDB への完全置き換え計画

## 目的

Jazz 2 alpha で管理している個人シフトデータとローカルファースト identity を InstantDB に置き換える。置き換え後はアプリ内から `jazz-tools` / `jazz-rn` / `JazzProvider` / `useAll` / `useDb` / `useSession` を削除し、InstantDB の `init` / `db.useQuery` / `db.transact` / `db.useUser` に統一する。

この計画での「完全置き換え」は Jazz の撤去を指す。現行の Convex はグループ、招待、チャット、未読、presence の source of truth として残す。Convex のチャット/未読周りは既に完成度が高いため、InstantDB に寄せない。ただし Convex 側の `jazzUserId` は Jazz 撤去後に意味がずれるため、保存先は Convex のまま `instantUserId` にリネームする。

## 現状

### Jazz が担当している領域

- 個人シフト同期: `shiftPatterns`, `shifts`, `dayNotes`, `shiftMembers`
- 端末 secret ベースの identity: `useLocalFirstAuth()` と `session.user_id`
- グループシフト表示でのメンバー別購読: Convex の `groupMembers.jazzUserId` を使い、Jazz の `$createdBy` で各メンバーの `shiftPatterns` / `shifts` を読む
- Expo 起動時の Jazz RN 初期化: `loadJazzRn()` と `JazzProvider`
- Metro の Jazz dev server/env 注入: `withJazz(config, { schemaDir: projectRoot })`

### 既にある InstantDB 関連

- `@instantdb/react-native` は `package.json` に導入済み
- `@instantdb/react-native-mmkv` は `package.json` に導入済み
- `react-native-mmkv` と `react-native-nitro-modules` は導入済み
- `instant.schema.ts` / `instant.perms.ts` は未作成
- `EXPO_PUBLIC_INSTANT_APP_ID` は `.env` に追加済み

### 残っている Jazz 依存の主なファイル

- `src/app/_layout.tsx`
- `src/schema.ts` (Jazz schema。最終的に削除)
- `src/permissions.ts` (Jazz permissions。最終的に削除)
- `metro.config.mjs`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/settings.tsx`
- `src/app/export.tsx`
- `src/app/patterns/[patternId].tsx`
- `src/components/pattern/*`
- `src/components/shift/shift-detail-input-panel.tsx`
- `src/components/member/member-list-view.tsx`
- `src/lib/shift-pattern-presets.ts`
- `src/lib/work-data-actions.ts`
- `src/app/share-groups/*`
- Convex schema/functions and UI 引数名の `jazzUserId`

## 移行方針

1. InstantDB の app id と schema/perms を先に確定する。
2. Jazz と同じ概念を InstantDB に移し、`owner` link で所有者を明示する。
3. 個人画面を先に InstantDB へ置換し、シフト作成、編集、削除、並び替え、エクスポートを動かす。
4. Convex グループ、membership、チャット、未読、presence は残しつつ、`jazzUserId` を `instantUserId` にリネームする。
5. グループシフト画面のメンバー別購読を InstantDB query に置換する。
6. Jazz package、schema、permissions、Metro 設定、環境変数を削除する。

開発中のため、旧 Jazz データ、旧 Convex データ、旧 deep link、旧 user id の互換性は持たない。移行中に Jazz と InstantDB の二重書き込み期間は作らず、InstantDB/Convex の開発データを reset して一括切り替えする。

## InstantDB データモデル案

InstantDB では links を使って所有者と関連を表す。現行 UI は owner、日付、並び順で絞り込み/ソートするため、通常 field として残す日付・並び順は indexed にする。所有者や pattern/member 参照は string/json ではなく links に寄せる。

```ts
// instant.schema.ts
import { i } from "@instantdb/react-native";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    shiftPatterns: i.entity({
      name: i.string(),
      emoji: i.string(),
      orderIndex: i.number().indexed(),
      countsAsDayOff: i.boolean(),
      isAllDay: i.boolean(),
      startDate: i.number().optional(),
      endDate: i.number().optional(),
    }),
    shifts: i.entity({
      startDate: i.number().indexed(),
    }),
    dayNotes: i.entity({
      date: i.number().indexed(),
      notes: i.string(),
    }),
    shiftMembers: i.entity({
      name: i.string(),
      orderIndex: i.number().indexed(),
    }),
  },
  links: {
    shiftPatternOwner: {
      forward: { on: "shiftPatterns", has: "one", label: "owner" },
      reverse: { on: "$users", has: "many", label: "shiftPatterns" },
    },
    shiftOwner: {
      forward: { on: "shifts", has: "one", label: "owner" },
      reverse: { on: "$users", has: "many", label: "shifts" },
    },
    dayNoteOwner: {
      forward: { on: "dayNotes", has: "one", label: "owner" },
      reverse: { on: "$users", has: "many", label: "dayNotes" },
    },
    shiftMemberOwner: {
      forward: { on: "shiftMembers", has: "one", label: "owner" },
      reverse: { on: "$users", has: "many", label: "shiftMembers" },
    },
    shiftPattern: {
      forward: { on: "shifts", has: "one", label: "pattern" },
      reverse: { on: "shiftPatterns", has: "many", label: "shifts" },
    },
    shiftAssignedMembers: {
      forward: { on: "shifts", has: "many", label: "shiftMembers" },
      reverse: { on: "shiftMembers", has: "many", label: "shifts" },
    },
    nextDayShiftPattern: {
      forward: { on: "shiftPatterns", has: "one", label: "nextDayPattern" },
      reverse: { on: "shiftPatterns", has: "many", label: "previousDayPatterns" },
    },
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
```

### 型変換

Jazz は `timestamp` を `Date` として扱っているが、InstantDB では `number` の epoch milliseconds に寄せる。

- 読み取り時: `new Date(row.startDate)` / `new Date(row.date)`
- 書き込み時: `startOfDay(date).getTime()`
- `shifts.pattern` は `shiftPattern` link で扱う
- `shifts.shiftMembers` は many-to-many link で扱う
- `owner` は `$users` への link で扱う

`nextDayPattern` は self link として扱う。現行 UI で不要なら初期実装では link 作成処理だけ後回しにしてもよいが、schema 上は relation として定義する。

`members` は InstantDB 移行時に `shiftMembers` へ改名する。あわせて `shifts.memberIds` は id 配列ではなく `shifts.shiftMembers` link に置き換える。Convex の `groupMembers` と意味が衝突するため、個人の勤務メンバーは `shiftMembers`、グループ所属者は `groupMembers` として分ける。

プリセット追加時は InstantDB の `id()` で先に全 pattern id を確保する。これにより「夜勤」作成時点で「明け」の id がまだない問題を避けられる。同じ `db.transact([...])` 内で `create(...).link({ owner, nextDayPattern })` まで組み立てる。

## InstantDB permissions 案

個人のメモは本人のみ。シフト、パターン、勤務メンバーはグループ共有表示のために member id を知るユーザーから読める必要がある。membership は引き続き Convex が source of truth で、InstantDB permissions から Convex membership は参照できない。そのため初期移行では現行 Jazz permissions と同じく `shiftPatterns` / `shifts` / `shiftMembers` の read は広めに許可し、write は owner のみにする。

Guest Auth の user も `auth.id` を持つため、以下の owner-based rules で guest 書き込みを許可できる。本ログインへ昇格しても user id が維持されるケースでは、データ owner link を付け替えずに継続利用できる。

```ts
// instant.perms.ts
import type { InstantRules } from "@instantdb/react-native";

const rules = {
  $default: {
    allow: {
      $default: "false",
    },
  },
  attrs: {
    allow: {
      create: "false",
    },
  },
  $users: {
    allow: {
      view: "auth.id != null && auth.id == data.id",
    },
  },
  shiftPatterns: {
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id in data.ref('owner.id')",
    },
  },
  shifts: {
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id in data.ref('owner.id')",
    },
  },
  dayNotes: {
    allow: {
      view: "isOwner",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id in data.ref('owner.id')",
    },
  },
  shiftMembers: {
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
    bind: {
      isOwner: "auth.id != null && auth.id in data.ref('owner.id')",
    },
  },
} satisfies InstantRules;

export default rules;
```

`attrs.create=false` で、クライアントが schema にない namespace/field をその場で増やすことを防ぐ。`bind` は rules の重複を減らすために使う。owner link は作成後に通常 UI から変更しない。InstantDB permissions では `newData.ref(...)` を使わず、owner link の immutability は app 側 transaction 設計で担保する。

Convex のグループ membership、チャット、未読、presence はこの移行では InstantDB に移さない。InstantDB は個人シフトデータの同期を担当し、Convex は協調機能を担当する分担を維持する。

## 認証方針

Jazz の `useLocalFirstAuth()` は端末 secret だけで identity を作っていた。InstantDB では Guest Auth を使い、初回起動時に `db.auth.signInAsGuest()` で guest user を作って即利用できるようにする。

MVP 方針:

1. アプリ起動時に未ログインなら自動で guest sign-in する
2. guest user でも `auth.id` を持つため、個人シフトデータと Convex 連携は通常どおり書き込める
3. `db.useUser()` の `user.id` を app 内 user id として使う
4. 本ログインはバックアップ/復旧用として設定画面の既存「アカウントを紐付け」導線から行う
5. 本ログイン UI は今回実装しないが、既存の準備中 row は Guest Auth 前提の文言に整える

InstantDB の Guest Auth は、guest user が後から email 等で本ログインした場合に同じ user を full user に昇格できる。本ログイン実装時は magic code または Sign in with Apple を設定画面から実行し、guest のデータを保持したまま復旧可能なアカウントへ昇格する。

同じ email の既存 full user と衝突する場合は linked guest user の merge が必要になるが、これは本ログイン実装時の課題として残す。今回の Jazz 置換では guest の自動作成と guest 書き込みだけを実装対象にする。

## 実装フェーズ

### Phase 0: InstantDB app 準備

- `.env` の `EXPO_PUBLIC_INSTANT_APP_ID` を `src/lib/instant.ts` から参照する
- `instant.schema.ts` を作る
- `instant.perms.ts` を作る
- `bun x instant-cli push schema --yes`
- `bun x instant-cli push perms --yes`
- `src/lib/instant.ts` を作り、`init({ appId, schema, Store })` を一箇所に集約する
- InstantDB の local persistence は AsyncStorage ではなく MMKV を使う

完了条件:

- InstantDB app id が Expo から参照できる
- schema/perms が push 済み
- `@instantdb/react-native-mmkv` の `Store` を `init` に渡している
- `db.useQuery` と `db.transact` を import できる
- `create().link({ owner: user.id })` が owner-based create permission を通ることを smoke test する
- `"owner.id"` nested where と `startDate` range where を組み合わせた query が動くことを smoke test する

MMKV は native code を使うため、確認は Expo Go ではなく dev client / `expo run:ios` / `expo run:android` で行う。このプロジェクトは既に native dependencies を含むため、InstantDB の persistence も最初から MMKV に寄せる。

### Sandbox 検証結果

`/instant-sandbox` で実機確認済み。

確認済み:

- `db.auth.signInAsGuest()` で guest user が作成される
- アプリ再起動後も auth state が維持される
- MMKV persistence が効いている
- Cloud dashboard に sandbox data が反映される
- 機内モードで `create().link()` できる
- オンライン復帰後に機内モード中の作成 data が同期される
- `create().link({ owner })` が owner-based create permission を通る
- `nextDayPattern` self link が作成できる
- `shift.pattern` / `shift.shiftMembers` links が取得できる
- `"owner.id": { $in: [...] }` と `startDate` range query が動く
- `unlink({ shiftMembers })` が動く
- `delete()` が動く
- sandbox rows cleanup が動く

Sandbox で判明したこと:

- `$like` は比較 operator 扱いで、対象 field が indexed でないと使えない。
- `notes` / `name` は本設計では indexed にしないため、sandbox prefix 判定は query ではなく client-side filter にした。

実装中または実装後に確認する残タスク:

- 別 guest user から `shiftPatterns` / `shifts` / `shiftMembers` が read できる
- 別 guest user から `dayNotes` は read できない
- 別 guest user から他人 owner の row は update/delete できない

### Phase 1: Provider と identity を置換

対象:

- `src/app/_layout.tsx`
- `metro.config.mjs`

作業:

- `jazz-tools/expo/polyfills` を削除する
- `loadJazzRn()` と Jazz ロード待ち state を削除する
- `useLocalFirstAuth()` を削除する
- `JazzProvider` を削除する
- `ConvexProvider` は維持する
- root で InstantDB auth 状態を扱う component を追加する
- `db.SignedOut` ではログイン画面を出さず、`db.auth.signInAsGuest()` を自動実行する
- guest sign-in 中だけ splash/loading 相当の空表示にする
- guest sign-in 失敗時はエラーを throw して開発中に検知できるようにする
- 既存 UI は `db.SignedIn` 配下に移す
- `withJazz` を Metro 設定から削除する

完了条件:

- アプリ起動時に Jazz RN のロードが走らない
- `EXPO_PUBLIC_JAZZ_*` がなくても起動できる
- 未ログイン状態から自動で guest user が作られる
- guest user の `db.useUser().id` から current user id を取得できる
- guest user で個人データを書き込める

### Phase 2: 個人シフトデータ hooks を作る

対象:

- 新規 `src/lib/instant.ts`
- 新規 `src/lib/current-user.ts` または `src/lib/work-data.ts`

作業:

- `useCurrentUserId()` を作る
- `useOwnWorkData()` を作り、以下をまとめて購読する
  - `shiftPatterns` where `"owner.id"`
  - `shifts` where `"owner.id"`
  - `dayNotes` where `"owner.id"`
  - `shiftMembers` where `"owner.id"`
- `useMemberScheduleData(ownerUserId)` を作り、グループシフト画面用に `shiftPatterns` / `shifts` を購読する
- グループシフト表では member ごとの hidden subscription component をやめ、`"owner.id": { $in: memberUserIds }` と `startDate` range の単一 query を優先する
- カレンダー表示用の `useShiftRange(ownerUserId, range)` を作り、`startDate` の `$gte` / `$lte` で表示範囲だけを購読する
- shift query では `pattern`, `shiftMembers`, `owner` relation を明示して取得する
- pattern/member 一覧 query では必要に応じて `fields` を使い、カレンダー描画に不要な field を取らない
- Date 変換は hook 境界で吸収するが、relation は旧 id field に戻さず link shape のまま画面へ渡す
- InstantDB の conditional query は `null` で skip する

完了条件:

- 画面側が `useAll(app.*.where({ $createdBy }))` を直接呼ばなくなる
- ownership filter は `"owner.id"` の nested where に統一される
- グループシフト表のデータ取得は member 数に比例した hook/component 増加を避ける

### カレンダー query 方針

月カレンダーとグループシフト表は、Infinite Queries ではなく日付範囲 query を基本にする。

理由:

- カレンダーは「次の N 件」ではなく「表示中の月/前後バッファの日付範囲」が必要
- 過去方向と未来方向の両方に移動するため、単方向の `loadNextPage` より `startDate >= range.start && startDate <= range.end` の方が状態管理が単純
- 月を移動したときに query が reset される挙動は問題ないが、infinite query の page 状態はカレンダーの range 状態と二重管理になりやすい
- `shifts.startDate` と `dayNotes.date` は indexed にして、範囲 filter と order を前提にする

Infinite Queries は、チャット履歴、イベント履歴、将来の長い監査ログのように「古いものを追加で読む」UI で使う。グループシフト表で年単位の大量表示が必要になった場合も、まずは月単位 range query を広げる設計を優先し、実測で不足したときに再検討する。

## UI 変更方針

InstantDB の query shape に合わせて、既存 UI も link shape に直接対応させる。互換用に `shiftPatternId` / `memberIds` を再生成する adapter は作らない。

- 個人カレンダーは全シフト購読から表示範囲購読に変える。月移動時に `range` を広げ、`shiftsByDate` は range 内データから作る。
- グループシフト表は `MemberScheduleSubscription` を member 数分 render する構造をやめる。Convex membership から `instantUserId[]` を作り、InstantDB で `owner.id in instantUserIds` かつ `startDate` range の query を 1 つ発行する。
- グループシフト表の `memberScheduleData` state は、query 結果から `owner.id` ごとに groupBy した derived data にする。購読結果を `useEffect` で state にコピーしない。
- shift detail の勤務メンバー選択は `shift.shiftMembers` を直接読み、UI の selected keys だけ `new Set(shift.shiftMembers.map((member) => member.id))` として作る。保存時は差分 `link({ shiftMembers })` / `unlink({ shiftMembers })` に変換する。
- pattern edit/detail は `shift.pattern?.id` と `pattern.nextDayPattern?.id` を使う。旧 `shiftPatternId` / `nextDayPatternId` props は作らない。
- member delete は `shift.memberIds.filter(...)` をやめ、対象 shift から `unlink({ shiftMembers: member.id })` する。
- calendar/export/group shift map は `shift.pattern` と `shift.shiftMembers` を直接参照する。
- settings のアカウント欄は既存 row を活かし、guest user 表示と準備中の本ログイン導線だけにする。

変えないもの:

- Convex のグループ、招待、チャット、未読、presence UI は基本維持する。
- チャット履歴は Convex の既存 pagination/ordering を維持し、InstantDB Infinite Queries へ移さない。
- 個人カレンダーの見た目、月完成判定、エクスポート操作は維持する。

### Phase 3: 書き込み処理を `db.transact` に置換

対象:

- `src/lib/shift-pattern-presets.ts`
- `src/lib/work-data-actions.ts`
- `src/components/pattern/pattern-grid-view.tsx`
- `src/components/pattern/pattern-grid-header.tsx`
- `src/components/pattern/pattern-edit-view.tsx`
- `src/components/pattern/pattern-list-view.tsx`
- `src/components/shift/shift-detail-input-panel.tsx`
- `src/components/member/member-list-view.tsx`

作業:

- `useDb()` を削除し、`db.transact(db.tx.*)` に置換する
- `db.insert` は `id()` で UUID を生成して `db.tx.entity[id].create(...)` に置換する
- `db.update` は `db.tx.entity[row.id].update(...)` に置換する
- `db.delete` は `db.tx.entity[row.id].delete()` に置換する
- Jazz `batch` は `db.transact([...])` に置換する
- 作成時は `owner` link を明示する
- pattern 設定は `link({ pattern: patternId })` / `unlink` に置換する
- 勤務メンバー設定は `link({ shiftMembers: shiftMemberIds })` / `unlink` に置換する
- `delete()` で link association も削除されるため、削除済み row への明示 unlink は基本不要にする
- 削除時の `wait({ tier: "local" })` と Jazz 固有の "row already deleted" 判定を削除する
- Jazz `members` table は InstantDB `shiftMembers` namespace に置換する
- Jazz `shifts.memberIds` は InstantDB `shifts.shiftMembers` link に置換する

作成 transaction の基本形:

```ts
db.transact(
  db.tx.shiftMembers[shiftMemberId]
    .create({ name, orderIndex })
    .link({ owner: user.id })
);

db.transact(
  db.tx.shifts[shiftId]
    .create({ startDate })
    .link({
      owner: user.id,
      pattern: patternId,
      shiftMembers: shiftMemberIds,
    })
);
```

`update()` は upsert でも使えるが、この移行では新規作成と更新の意図を分けるため、作成は `create()`、既存 row 更新は `update()` に統一する。

プリセット追加の基本形:

```ts
const patternIdsByName = new Map(
  preset.patterns.map((pattern) => [pattern.name, id()])
);

const transactions = preset.patterns.map((pattern, index) => {
  const patternId = patternIdsByName.get(pattern.name);
  const nextDayPatternId = pattern.nextDayPatternName
    ? patternIdsByName.get(pattern.nextDayPatternName)
    : undefined;

  if (!patternId) {
    throw new Error(`Pattern id not found: ${pattern.name}`);
  }

  let transaction = db.tx.shiftPatterns[patternId]
    .create(createPatternInsert(pattern, startOrderIndex + index))
    .link({ owner: user.id });

  if (nextDayPatternId) {
    transaction = transaction.link({ nextDayPattern: nextDayPatternId });
  }

  return transaction;
});

db.transact(transactions);
```

Jazz では `batch.insert` の戻り id を後段の `batch.update` で `nextDayPatternId` に入れていた。InstantDB では id を先に作れるため、プリセット追加を 1 pass の transaction にできる。

完了条件:

- 個人のパターン追加、編集、削除、並び替えが動く
- 日別シフト入力、上書き、重複削除が動く
- 勤務メンバー追加、編集、削除、シフトからの shift member id 除去が動く
- 仕事データリセットが動く

### Phase 4: 個人画面とエクスポートを置換

対象:

- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/settings.tsx`
- `src/app/export.tsx`
- `src/app/patterns/[patternId].tsx`

作業:

- `useSession()` を `db.useUser()` ベースに置換する
- `currentUserId = user.id` に統一する
- `useAll` を Phase 2 の hooks に置換する
- `selectedDateShift`, `dayNotesByDate`, export data の Date 変換を確認する
- settings の既存「アカウントを紐付け」「紐付け解除」row を InstantDB Guest Auth 前提の文言に整える
- 本ログイン機能は未実装のまま disabled/準備中表示にし、今回の scope に含めない

完了条件:

- カレンダー表示、月完了判定、端末カレンダー出力、画像出力が Jazz なしで動く
- settings のリセット/グループ退出が Instant user id で動く
- settings から guest user で利用中であることが分かる
- 本ログイン実装がなくても通常利用を妨げない

### Phase 5: Convex の user id 名を `instantUserId` に置換

対象:

- `convex/schema.ts`
- `convex/groups.ts`
- `convex/invites.ts`
- `convex/chat.ts`
- `convex/presence.ts`
- `convex/groupEvents.ts`
- `convex-lib/*`
- `src/app/share-groups/*`
- `src/components/group/*`
- `src/components/chat/*`
- `src/lib/chat-presence.ts`

作業:

- Convex の責務は維持し、グループ membership、チャット、未読、presence を InstantDB へ移さない
- Convex table fields:
  - `groupMembers.jazzUserId` -> `instantUserId`
  - `chatMessages.authorJazzUserId` -> `authorInstantUserId`
  - `groupEvents.actorJazzUserId` -> `actorInstantUserId`
  - `groupEvents.targetJazzUserId` -> `targetInstantUserId`
- Index names:
  - `by_jazzUserId` -> `by_instantUserId`
  - `by_groupId_jazzUserId` -> `by_groupId_instantUserId`
- Route param:
  - `[memberJazzUserId]` -> `[memberInstantUserId]`
- UI text はユーザーに見えない内部名だけ変える
- Convex 開発データは reset する
- 旧 `jazzUserId` field からの migration は作らない

完了条件:

- Convex が引き続きグループ membership、チャット、未読、presence の source of truth になっている
- Convex schema/code に `jazz` という identifier が残らない
- グループ作成、招待参加、設定変更、退出、メンバー削除が Instant user id で動く
- グループチャット、個別チャット、既読、presence が Instant user id で動く

### Phase 6: グループシフト表示を InstantDB に置換

対象:

- `src/app/share-groups/[groupId]/shifts.tsx`

作業:

- `MemberScheduleSubscription` の `useAll(app.shifts.where({ $createdBy: memberUserId }))` を `useMemberScheduleData(memberInstantUserId)` に置換する
- `ShiftWithCreatedBy` を `ShiftWithOwner` に変更する
- `shiftsByUserAndDate` の key を `${shift.owner.id}:${date}` に変更する
- pattern lookup は InstantDB の pattern id で維持する

完了条件:

- グループメンバーごとのシフト表が InstantDB の `owner` link で表示される
- Jazz の `$createdBy` 依存が消える

### Phase 7: Jazz の撤去

対象:

- `package.json`
- `bun.lock`
- `src/schema.ts`
- `src/permissions.ts`
- `metro.config.mjs`
- docs

作業:

- `jazz-tools` と `jazz-rn` を dependencies から削除する
- `src/schema.ts` を削除する
- `src/permissions.ts` を削除する
- InstantDB schema/perms は project root の `instant.schema.ts` / `instant.perms.ts` に集約する
- アプリ側の型 import は `src/schema.ts` ではなく、新規 `src/lib/instant.ts` または `instant.schema.ts` から取る
- `metro.config.mjs` から `withJazz` を削除する
- `.env` から `EXPO_PUBLIC_JAZZ_APP_ID` / `EXPO_PUBLIC_JAZZ_SERVER_URL` を削除する
- 古い Jazz 設計 docs を archived 扱いにし、新計画へのリンクを追加する

完了条件:

- `rg "jazz|Jazz|JAZZ" src convex convex-lib package.json metro.config.mjs` が 0 件、または archived docs のみ
- `bun install` 後に Jazz package が lockfile から消える

## データリセット方針

開発中のため、既存データ移行は行わない。

作業:

- InstantDB は新規 app を作るか、既存 app の対象 namespace を空にする
- Convex は dev deployment の対象 tables を reset する
- Jazz Cloud 側データは参照しない
- 旧 invite link / 旧 share group URL / 旧 chat URL は切り捨てる
- `jazzUserId` から `instantUserId` への対応表は作らない

完了条件:

- 新しい InstantDB user で初期状態からアプリを開始できる
- 旧 Jazz user id を必要とするコードパスがない
- migration script がリポジトリに追加されていない

## 検証項目

- `bun x ultracite check`
- `bun x tsc --noEmit`
- `bun start`
- 初回起動時の guest sign-in
- guest user での書き込み
- パターンセット追加
- パターン編集
- パターン並び替え
- シフト入力
- 同日シフト上書き
- 翌日選択
- 日別メモ追加/削除
- 勤務メンバー追加/編集/削除
- 勤務メンバー削除時に既存シフトから shift member id が外れる
- 月完成判定
- カレンダーエクスポート
- 画像エクスポート
- グループ作成
- 招待作成/参加
- グループ詳細
- グループシフト表
- グループチャット
- 個別チャット
- 既読/presence
- 設定から全データ削除
- Jazz env vars を消しても起動できる

## リスクと対策

### InstantDB auth への切り替えで user id が変わる

対策: 開発中なので許容する。旧 user id 互換や mapping は作らない。

### guest user のまま端末を失うと復旧できない

対策: MVP では許容する。設定画面にバックアップ/復旧の準備中導線を置き、本ログイン実装時に Guest Auth の full user 昇格を使う。

### グループシフトの read permission が広い

対策: 現行 Jazz と同じ前提で初期移行する。Convex membership を InstantDB permissions から直接参照できないため、グループシフトの read 制御はアプリ UI と Convex membership で表示対象を決める。シフト自体を強い機密データとして扱う段階になったら、別途 server-mediated read や共有用 projection を検討する。

### Date 型が number になり既存ロジックが壊れる

対策: hooks 境界で Date に戻す。書き込み helper だけ epoch milliseconds を扱う。

### link shape 対応の変更範囲が広い

対策: 開発中で互換不要なので、旧 shape adapter は作らない。`shiftPatternId`, `memberIds`, `nextDayPatternId` を残さず、UI も `pattern`, `shiftMembers`, `nextDayPattern` を直接扱う。変更範囲は広いが、移行後に互換層を剥がす二度手間を避ける。

### InstantDB query の index 不足

対策: `startDate`, `date`, `orderIndex` は初期 schema で indexed にする。ownership は `"owner.id"` の nested where に統一し、InstantDB の実挙動を Phase 0 で確認する。

### Convex rename の影響範囲が広い

対策: Convex の責務は変えず、`jazzUserId` という名称だけを `instantUserId` に置換する。先に個人データだけ InstantDB 化し、Convex rename は別 commit に分ける。開発データは reset し、schema rename/migration より全置換を優先する。

## 推奨実装順

1. Phase 0 と Phase 1 を 1 commit
2. Phase 2 と Phase 3 を 1 commit
3. Phase 4 を 1 commit
4. Phase 5 を 1 commit
5. Phase 6 と Phase 7 を 1 commit

各 commit で `bun x ultracite check` と `bun x tsc --noEmit` を通す。UI の挙動確認は Phase 4 以降、Expo dev server と実機またはシミュレータで行う。
