# 招待リンク Next.js 実装計画

## 目的

シフト共有グループの招待URLを、LINEなどで共有しやすい HTTPS URL として提供する。

URLを開いた人は、アプリ内の招待参加画面で自分の表示名を入力し、共有グループに参加する。

## 採用方針

招待URLの landing / fallback / API は、この Expo repo の EAS Hosting ではなく、既存の `chiji.tech` 紹介サイトの Next.js repo 側に実装する。

EAS Hosting に招待 API はデプロイしない。Expo repo には招待 API Route を置かず、Next.js 側に `/nurse-shift/api/invites` を実装する。

## 判断理由

- `EXPO_PUBLIC_INVITE_BASE_URL` はユーザーが実際に見るURLなので、独自ドメインを使う方が自然。
- 既存の `chiji.tech` ドメイン設定を活かせる。
- EAS Hosting custom domain は paid plan 前提で、project ごとに 1 custom domain の制約がある。
- Next.js なら Node runtime を使えるため、将来 `jazz-tools/backend` + `jazz-napi` で server-side membership 検証に移行しやすい。
- 招待ページの OGP、未インストール fallback、App Store / Play Store 導線を作りやすい。

## URL 方針

採用:

```txt
https://chiji.tech/nurse-shift/invite/<inviteId>
```

Expo アプリ側は次を設定する。

```txt
EXPO_PUBLIC_INVITE_BASE_URL=https://chiji.tech/nurse-shift
```

## MVP のセキュリティ前提

この MVP は、公開グループや悪意ある改造クライアントを強く想定しない。

backend は Jazz に接続せず、招待 ID の発行、Upstash Redis への保存、期限切れ判定だけを担当する。招待作成者が本当に group member かの検証、参加時の server-side membership 作成、`shareGroupAccess` の完全な正規化は行わない。

参加処理では、Expo アプリが `shareGroupMembers` と `shareGroupAccess` を Jazz に書き込む。

## 招待 ID 仕様

招待 URL に載せる値は、12文字の URL-safe random ID。

```txt
<inviteId>
```

招待データは Upstash Redis に TTL 付きで保存する。

```ts
type InviteRecord = {
  expiresAt: number;
  groupId: string;
  groupName: string;
};
```

期限は現状 30 日。

Redis key:

```txt
nurse-shift:invite:<inviteId>
```

## Next.js 側で実装するもの

### `POST /nurse-shift/api/invites`

request body:

```json
{
  "groupId": "string",
  "groupName": "string"
}
```

処理:

- `groupId` と `groupName` を trim して必須チェックする。
- 12文字の招待 ID を発行する。
- Upstash Redis に招待データを TTL 30日で保存する。
- `INVITE_BASE_URL` または production host + `/nurse-shift` から invite URL を組み立てる。

response:

```json
{
  "expiresInMs": 2592000000,
  "inviteId": "8Z4-yemWWxkV",
  "url": "https://chiji.tech/nurse-shift/invite/8Z4-yemWWxkV"
}
```

MVPでは Jazz backend で招待作成者の membership は検証しない。

### `GET /nurse-shift/api/invites/[inviteId]`

処理:

- invite ID で Upstash Redis から招待データを取得する。
- レコードが存在し、`expiresAt` が現在時刻より未来であることを確認する。

response:

```json
{
  "expiresAt": 1760000000000,
  "groupId": "string",
  "groupName": "string"
}
```

無効または期限切れの場合は `404` を返す。

### `GET /nurse-shift/invite/[inviteId]`

ブラウザで開いたときの landing / fallback ページ。

役割:

- invite ID から招待データを取得してグループ名を表示する。
- Universal Links / Android App Links は別途設定する。
- MVP では `nurse-shift://invite/<inviteId>` の「アプリで開く」ボタンを置く。
- アプリ未インストール時は紹介文と仮のストア導線を表示する。
- OGP を設定し、LINE などで見たときに分かりやすい表示にする。

## Expo repo 側の接続点

- `src/app/(tabs)/group.tsx`
  - `EXPO_PUBLIC_INVITE_BASE_URL` に対して `POST /api/invites` を呼ぶ。
  - Next.js 側 API にそのまま接続できる。
- `src/app/invite/[inviteId].tsx`
  - `EXPO_PUBLIC_INVITE_BASE_URL` に対して `GET /api/invites/:inviteId` を呼ぶ。
  - Next.js 側 API にそのまま接続できる。
- 招待 ID / Redis 保存ロジック
  - Expo repo には置かない。
  - Next.js repo 側でこのドキュメントの仕様に沿って実装する。
- `app.json`
  - scheme は `nurse-shift`。
  - HTTPS universal link / Android app link の設定は別途行う。

## 将来締める条件

次のどれかに該当したら、Next.js API 内で Jazz backend を使う方式へ移行する。

- Web 版を一般公開する。
- 招待URLが不特定多数に流通する。
- 荒らし対策や管理者権限が必要になる。
- groupId を知っているだけの参加を防ぎたい。
- `shareGroupAccess` の作成を server-side で完全に正規化したい。

移行時は、Next.js API 内で `createJazzContext(...).forRequest(request)` を使い、招待発行者の membership を検証する。参加処理も server-side で `shareGroupMembers` と `shareGroupAccess` を作成する。
