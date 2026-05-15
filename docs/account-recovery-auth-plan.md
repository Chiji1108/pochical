# アカウント復旧サインイン 実装計画

## 目的

機種変更、再インストール、端末紛失時に、Jazz の同じユーザーとして戻れるようにする。

現在の `useLocalFirstAuth()` は端末内の secret に依存する。クラウド同期自体は外部アカウントなしでも可能だが、secret を失うと同じ `user_id` として復旧できない可能性がある。

そのため、任意で Google / Apple などの外部アカウント連携を追加し、ユーザーが明示的に復旧可能な状態にできるようにする。

## 方針

- サインインは必須にしない。
- 初回体験は local-first のまま軽く保つ。
- 設定画面などに「アカウントを保護」「機種変更に備える」導線を置く。
- Google / Apple 連携は復旧・複数端末利用のための任意機能にする。
- 共有グループ機能とは別プランで実装する。

## なぜ必要か

local-first auth:

```txt
secret が端末に保存される
  ↓
secret から Jazz の identity / user_id が決まる
  ↓
同じ secret なら同じ user_id
  ↓
secret を失うと同じ user_id に戻れない
```

外部アカウント連携:

```txt
Google / Apple でログイン
  ↓
安定した外部 user id を Jazz の user_id に使う、または Jazz identity と紐づける
  ↓
別端末や再インストール後も同じユーザーとして戻れる
```

## UX

### 初回

初回起動ではサインインを要求しない。

```txt
アプリをすぐ使い始める
  ↓
ローカル secret で Jazz identity を作る
  ↓
シフト入力・共有が可能
```

### 任意連携

設定またはプロフィール画面に導線を置く。

```txt
アカウントを保護
機種変更してもデータを復元できます

[Appleで続ける]
[Googleで続ける]
```

連携済みの場合:

```txt
アカウント保護済み
Apple / Google と連携中
```

## 実装候補

### 候補 A: Auth Provider 統合

Jazz 2 の auth provider integration を使い、外部 auth の JWT を Jazz に渡す。

候補:

- Clerk
- Better Auth
- WorkOS
- 独自 API + Google / Apple token verification

メリット:

- 別端末復旧が自然。
- Google / Apple / メールなどをまとめやすい。
- 将来、ユーザー検索やサポート対応が必要になった時に拡張しやすい。

注意点:

- 実装量が増える。
- Expo native の Google / Apple sign-in とサーバー側 token verification が必要。
- Jazz 2 の最新 API を実装直前に公式 docs で確認する。

### 候補 B: Recovery Key / Passphrase

外部アカウントなしで、Jazz secret を復元できる recovery key をユーザーに保存してもらう。

メリット:

- 外部 auth provider が不要。
- サーバー依存が少ない。

注意点:

- 一般ユーザーには UX が難しい。
- recovery key を紛失すると復旧できない。
- Google / Apple 連携ほど自然ではない。

### 推奨

本アプリでは候補 A を本命にする。

理由:

- 一般ユーザーにとって Google / Apple 連携の方が理解しやすい。
- 機種変更・再インストール時の復旧導線が自然。
- グループ共有アプリでは、同じ人として戻れることが重要。

Recovery Key は、必要なら上級者向け・バックアップ手段として後で検討する。

## Google / Apple の扱い

Apple:

- iOS では Sign in with Apple が自然。
- Android では Google が自然。
- Apple はメール非公開になる場合があるため、内部的には provider subject を安定IDとして扱う。

Google:

- Android / iOS 両方で使える。
- Expo では実装方式を事前に確認する。

MVPでは、両方を同時に必ず実装しなくてもよい。最初は Apple または Google の片方で復旧導線を作り、後から追加してもよい。

## データ移行方針

既に local-first secret で使い始めたユーザーが、後から外部アカウント連携できる必要がある。

理想:

```txt
匿名/local-first ユーザー
  ↓
Google / Apple と連携
  ↓
既存の shifts / patterns / members / shareGroupMembers を維持
  ↓
以後は外部アカウントで復旧可能
```

実装時に確認すること:

- Jazz 2 で local-first identity を外部 auth identity にリンクできるか。
- 既存 `$createdBy` の扱いが変わるか。
- user_id が変わる場合、既存 row の所有者や `shareGroupMembers.user_id` をどう移行するか。

この確認が終わるまで、外部 auth 連携は本実装に入らない。

## 実装ステップ

### Phase 1: 調査

- Jazz 2 公式 docs の auth provider integration を確認する。
- Expo での Apple / Google sign-in の最新推奨を確認する。
- local-first identity から外部 auth identity へのリンク可否を確認する。
- user_id が変わる場合の移行手順を整理する。

### Phase 2: UI

- 設定画面またはプロフィール画面を用意する。
- 「アカウントを保護」導線を追加する。
- 連携済み/未連携の状態表示を作る。

### Phase 3: Auth Provider

- Google / Apple のどちらか一方から実装する。
- サーバー側で token verification する。
- Jazz Provider に外部 auth token / config を渡す。
- 再インストール相当の状態で同じユーザーに戻れることを確認する。

### Phase 4: 追加対応

- もう一方の provider を追加する。
- ログアウト/再ログインの扱いを整理する。
- グループ共有済みユーザーで復旧できることを確認する。

## 未決事項

- 最初に実装する provider を Apple にするか Google にするか。
- Clerk / Better Auth / WorkOS / 独自実装のどれを使うか。
- local-first identity と外部 auth identity のリンク方法。
- 既存 `$createdBy` と `shareGroupMembers.user_id` の移行が必要か。

