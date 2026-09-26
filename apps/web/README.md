# ポチカル Web

看護師向けのポチカル専用サイト。TanStack Start / React / Cloudflare Workersで動作します。旧Next.jsサイトには依存せず、旧URLの互換処理もありません。

## 開発

リポジトリのルートで `bun install`、`bun run web` を実行すると、通常は http://localhost:3000 で起動します。

- `bun run build:web`: Workers向けにビルド
- `bun run preview:web`: ビルド済みのサイトをWorkersランタイムで確認
- `bun run typecheck`: モバイル・Webの型チェック
- `bun run test`: モバイル・Webのテスト
- `bun run check` / `bun run fix`: 共通のUltracite設定でチェック・整形

ルートの `bun.lock` を使います。`routeTree.gen.ts` はTanStack Router、 `worker-configuration.d.ts` は `bun run --cwd apps/web cf-typegen` で生成します。Workers設定を変更したら型を再生成してください。

## ページ

| パス | 内容 |
| --- | --- |
| `/` | LP。勤務例は架空の画面イメージ |
| `/invite/$inviteCode` | Convexから招待を確認し、アプリへ移動 |
| `/privacy` | プライバシーポリシー |
| `/terms` | 利用規約 |
| `/support` | FAQと問い合わせ窓口 |
| `/account/delete` | Apple/Googleで本人確認、削除内容の確認、削除受付・進行状況 |

各ページをサーバーで描画します。削除のログインUIだけをクライアントで起動するため、LPではConvexの接続や認証UIの読み込みは発生しません。招待ページ・削除ページはnoindex、動的HTMLはno-storeです。招待先の名前はSNSのメタデータには掲載しません。

## 環境変数

`.env.example` を `.env.local` に、`.dev.vars.example` を `.dev.vars` にコピーします。値は同じConvex環境にそろえてください。

| 変数 | 設定場所 | 用途 |
| --- | --- | --- |
| `VITE_CONVEX_URL` | `.env.local` / CIのビルド環境 | Convexの `.cloud` URL。削除の認証・API接続 |
| `VITE_SITE_URL` | 同上 | 決定した本番HTTPSオリジン。canonicalとOG画像URL |
| `VITE_APP_STORE_URL` | 同上 | 公開後のApp Store URL |
| `VITE_GOOGLE_PLAY_URL` | 同上 | 公開後のGoogle Play URL |
| `POCHICAL_CONVEX_HTTP_URL` | `.dev.vars` / Workersの環境変数 | Convexの `.site` URL。招待確認 |

`VITE_*` は公開される値です。OAuthの秘密鍵・クライアントシークレット等は入れません。ストアURLが空なら公開準備中と表示します。ドメイン未設定ではcanonicalを出しません。Convex URL未設定でもLP・規約・サポートは動作し、削除ページにはメールの依頼窓口を表示します。開発用 `.env.local` のURLを本番ビルドに混ぜないよう、本番はCIで設定してください。

## Webからのアカウント削除

既存の `apps/mobile-legacy/convex` を使います。Webは生成済みAPIの型だけを参照し、Expoコードは実行時に読み込みません。新しい認証基盤や削除用DBはありません。

Web OAuthの戻り先を許可するため、対象の**開発環境**で次を設定します。本番公開時は確定した本番サイトのオリジンに置き換えます。

```sh
cd apps/mobile-legacy
bun x convex env set POCHICAL_WEB_ORIGIN http://localhost:3000
bun x convex dev --once
```

この変更はまだリモートのConvex環境に反映していません。上記の設定・反映前はWebへのOAuthリダイレクトが拒否されます。許可するWebパスは `/account/delete` の完全一致のみです。既存の `pochical://auth` も利用できます。任意の戻り先URLは許可しません。開発サーバーのポートを変えるときは許可オリジンも変更します。

Apple/GoogleのOAuth設定は既存のConvexのものを使います。プロバイダー側のコールバックは `https://<deployment>.convex.site/api/auth/callback/apple` および `/google` です。AppleはアプリとWebのService IDの関連付けを確認してください。メールアドレス一致による別アカウントの自動統合はしません。

削除ボタンは同意チェック後にだけ有効になります。Appleの失効用トークンが不足する場合は再ログインを案内します。受付後はランダムな受付番号をsessionStorageに保存し、既存の削除ジョブの状態を確認します。実アカウントの削除を自動テストでは実行しません。

## 公開前に設定するもの

- 専用ドメインと本番用の上記環境変数
- Convexの `POCHICAL_WEB_ORIGIN` とWeb対応の関数を反映
- アプリとConvexの `EXPO_PUBLIC_INVITE_BASE_URL` を新サイトのオリジンへ変更
- 実際に公開されたストアURL
- Apple/Googleで、アプリと同じアカウントになることの実環境確認
- 使い捨ての検証アカウントで、削除・Apple連携解除・端末側データ消去の確認
- 規約・プライバシー表記の運用確認。運営名・窓口は旧サイトのCHIJI TECHと連絡先を使用。外部サービスのログ・バックアップの保持期間など、実際の契約・設定で決まる事項を公開前に確認する。

ドメイン・プロバイダー設定が未確定のため、実際のOAuth完了とアカウント削除は未検証です。

公開作業はまだ行っていません。設定後、`apps/web` で `bun run deploy` を実行します。事前確認には `bun x wrangler deploy --dry-run` を利用できます。
