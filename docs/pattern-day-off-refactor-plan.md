# 勤務パターン休み判定 リファクタリング計画

## 目的

既存の `patterns.isHoliday` を `patterns.countsAsDayOff` にリネームし、時間設定や終日設定とは独立した「休み合わせ判定」専用のフィールドにする。

このリファクタリングを先に行うことで、グループ共有機能では「全員が休みの日」を `countsAsDayOff` で安定して判定できる。

## 現状の課題

現在の `isHoliday` は、休み合わせ判定だけでなく UI 制約にも使われている。

- `isHoliday` が true だと時間設定ができない。
- `isHoliday` が true だと `isAllDay` が強制的に true になる。
- 「明け」のように休み扱いしたいが、休日そのものではないパターンを表しづらい。
- 「待機」のように終日表示だが休み扱いしたくないパターンと区別しづらい。

## 新しい意味づけ

```ts
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
```

`countsAsDayOff` は、休み合わせ判定で休み扱いにするかだけを表す。

`isAllDay` は、時間範囲を持たない終日パターンとして表示するかだけを表す。

## パターン例

```txt
休み:
  countsAsDayOff = true
  isAllDay = true

明け:
  countsAsDayOff = true
  isAllDay = true

待機:
  countsAsDayOff = false
  isAllDay = true

日勤:
  countsAsDayOff = false
  isAllDay = false

夜勤:
  countsAsDayOff = false
  isAllDay = false
```

## UI 方針

勤務パターン編集画面では、「終日」と「休み合わせで休み扱い」を別々の設定にする。

- 「終日」は `isAllDay` を変更する。
- 「休み扱い」は `countsAsDayOff` を変更する。
- `countsAsDayOff` が true でも、必要なら時間設定できる余地を残す。
- `isAllDay` が true でも、`countsAsDayOff` が false のパターンを作れるようにする。

表示文言の候補:

- `countsAsDayOff`: 休み扱い
- 説明: 休み合わせ画面で休日として数えます
- `isAllDay`: 終日
- 説明: 開始・終了時刻を指定しません

## 翌日シフトパターンの制約

翌日シフトパターンは、夜勤など日をまたぐ勤務の翌日に自動で入れる補助パターンとして扱う。

無限ループや連鎖的な自動作成を避けるため、候補は `isAllDay === true` のパターンだけに限定する。

理由:

- 終日パターンは `nextDayPatternId` を設定できないため、翌日パターン同士の連鎖が起きない。
- 時間ありパターンを翌日に指定できると、そのパターンがさらに翌日パターンを持つ可能性があり、循環や多段展開を考える必要が出る。
- 「夜勤の翌日に明けを入れる」という主用途では、翌日に入るパターンは終日で十分。

UI ルール:

- `nextDayPatternId` の候補は `isAllDay === true` のパターンに限定する。
- `isAllDay === true` のパターン自身には `nextDayPatternId` を設定できない。
- パターンを終日に変更したら、既存の `nextDayPatternId` はクリアする。
- 翌日シフト候補の説明文は「終日パターンから選べます」にする。

この制約は `countsAsDayOff` とは独立させる。つまり、翌日シフト候補には `countsAsDayOff === true` のパターンだけでなく、終日だが休み扱いではないパターンも選べる。

## 実装ステップ

1. `src/schema.ts` の `patterns.isHoliday` を `countsAsDayOff` にリネームする。
2. `Pattern` を参照する UI 型やフォーム状態を更新する。
3. `pattern-edit-view.tsx` の `isHoliday` ロジックを分解する。
4. `pattern-grid-view.tsx` の初期パターンを更新する。
5. `pattern-list-view.tsx` と `shift-detail-view.tsx` の表示ラベル判定を更新する。
6. `nextDayPatternId` の候補を `isAllDay === true` のパターンだけに制限する。
7. `isAllDay === true` のパターンでは `nextDayPatternId` を設定不可にし、終日に変更した時は既存値をクリアする。
8. 既存データ移行が必要なら、`isHoliday` の値を `countsAsDayOff` にコピーする移行を検討する。
9. `bun x ultracite fix` と `bun x ultracite check` を実行する。

## 既存データ移行

開発中データを捨てられるなら、schema をリネームしてローカルデータをリセットするのが最も簡単。

既存データを保持する必要がある場合は、移行処理が必要になる。

```txt
countsAsDayOff = old isHoliday
```

`isAllDay` は既存値を維持する。ただし現在は `isHoliday` が true の時に `isAllDay` も true に強制されているため、過去の休日パターンは終日として残る。

## グループ共有機能との関係

グループ共有機能の「全員休日」判定は、このリファクタリング後に `countsAsDayOff` を使って実装する。

```ts
const isDayOff = !shift || pattern?.countsAsDayOff === true;
```

このリファクタリングを先に完了してから、Jazz 2 シフト共有機能に進む。
