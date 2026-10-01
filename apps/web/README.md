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
| `/invite/$inviteCode` | サーバー（`apps/server`）に招待を確認し、アプリへ移動 |
| `/privacy` | プライバシーポリシー |
| `/terms` | 利用規約 |
| `/support` | FAQと問い合わせ窓口 |
| `/account/delete` | 削除される内容と、メールでの削除依頼 |

各ページをサーバーで描画します。招待ページ・削除ページはnoindex、動的HTMLはno-storeです。招待ページのタイトルとOGPにはグループ名と絵文字を入れ、チャットに貼ったリンクのカードにも出します。ページを開けば誰でも見られる情報なので、カードに出しても見える範囲は変わりません。

## 環境変数

`.env.example` を `.env.local` に、`.dev.vars.example` を `.dev.vars` にコピーします。

| 変数 | 設定場所 | 用途 |
| --- | --- | --- |
| `VITE_SITE_URL` | `.env.local` / CIのビルド環境 | 決定した本番HTTPSオリジン。canonicalとOG画像URL |
| `VITE_APP_STORE_URL` | 同上 | 公開後のApp Store URL |
| `VITE_GOOGLE_PLAY_URL` | 同上 | 公開後のGoogle Play URL |
| `POCHICAL_SERVER_URL` | `.dev.vars` / Workersの環境変数 | サーバー（`apps/server`）のオリジン。招待確認。ローカルでは `mise run server` の `http://localhost:8787` |

`VITE_*` は公開される値です。OAuthの秘密鍵・クライアントシークレット等は入れません。ストアURLが空なら公開準備中と表示します。ドメイン未設定ではcanonicalを出しません。サーバーURL未設定でも招待ページ以外は動作し、招待ページは「確認できませんでした」と表示します。開発用 `.env.local` のURLを本番ビルドに混ぜないよう、本番はCIで設定してください。

## Webからのアカウント削除

新しいサーバーにはまだ認証がないため、削除はメールで受け付けています（ストアが求める、アプリの外から削除を依頼できる窓口）。認証ができたら、Webでの本人確認と削除をここに戻します。

## 公開前に設定するもの

- 専用ドメインと本番用の上記環境変数
- サーバーをデプロイし、Workersの `POCHICAL_SERVER_URL` にそのオリジンを設定
- 実際に公開されたストアURL
- Apple/Googleで、アプリと同じアカウントになることの実環境確認
- Webでの本人確認つき削除（認証ができてから）
- 規約・プライバシー表記の運用確認。運営名・窓口は旧サイトのCHIJI TECHと連絡先を使用。外部サービスのログ・バックアップの保持期間など、実際の契約・設定で決まる事項を公開前に確認する。

公開作業はまだ行っていません。設定後、`apps/web` で `bun run deploy` を実行します。事前確認には `bun x wrangler deploy --dry-run` を利用できます。
