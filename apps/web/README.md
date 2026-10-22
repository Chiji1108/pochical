# ポチカル Web

看護師向けのポチカル専用サイト。Astro / Cloudflare Workersで動作し、LPのアプリ画面だけをReactのアイランドとして動かします。旧Next.jsサイトには依存せず、旧URLの互換処理もありません。

## 開発

リポジトリのルートで `bun install`、`bun run web` を実行すると、通常は http://localhost:3000 で起動します。

- `bun run build:web`: Workers向けにビルド
- `bun run preview:web`: ビルド済みのサイトをWorkersランタイムで確認
- `bun run typecheck`: TypeScriptの全パッケージ（apps、packages、design）の型チェック
- `bun run test`: packages、web、design、serverのテスト
- `bun run check` / `bun run fix`: 共通のUltracite設定でチェック・整形

ルートの `bun.lock` を使います。ページは `src/pages` の `.astro` ファイルです。`bun run --cwd apps/web typecheck` は `astro check` で `.astro` を、`tsc --noEmit` で `src` のTS/TSXとそこから読み込むファイル（`@pochical/prototype` を含む）を確かめます。`astro check` が報告するのは `src` のファイルだけで、読み込み先の型エラーは出さないからです。`worker-configuration.d.ts` は `mise run gen:worker-types` で、ほかの Worker の分と一緒に生成します。CI は `mise run worker-types:check` でコミットとの差を確かめます。Workers設定を変更したら型を再生成してください。

## ページ

| パス | 内容 |
| --- | --- |
| `/` | LP。勤務例は架空の画面イメージ |
| `/invite/[code]` | サーバー（`apps/server`）に招待を確認し、アプリへ移動 |
| `/privacy` | プライバシーポリシー |
| `/terms` | 利用規約 |
| `/support` | FAQと問い合わせ窓口 |
| `/support/google-calendar` | Googleカレンダーにシフトを入れる手順（アプリから開く） |
| `/account/delete` | 削除される内容と、メールでの削除依頼 |

デザイン資料は `apps/design`、試作のデモは `apps/demo`、スマホで試す試作は `apps/try` にあります。

招待ページ（と招待の画像）以外はビルド時に描画し、静的ファイルとして配信します。招待ページはリクエストごとにWorkerで描画し、no-storeです。招待ページ・削除ページはnoindexです。セキュリティヘッダーは `src/lib/headers.ts` の一覧から、静的ファイルには `_headers`（ビルド時に書き出し）、Workerのページにはmiddlewareで付けます。日本語の改行位置（文節ごとの `<wbr>`）は、`.astro` のHTMLにはmiddlewareが、ReactのアイランドにはJSXランタイムが、同じBudouXの規則（`@pochical/jsx`）で入れます。招待ページのタイトルとOGPにはグループ名と絵文字を入れ、チャットに貼ったリンクのカードにも出します。ページを開けば誰でも見られる情報なので、カードに出しても見える範囲は変わりません。

## 環境変数

`.env.example` を `.env.local` にコピーします。

| 変数 | 設定場所 | 用途 |
| --- | --- | --- |
| `VITE_SITE_URL` | `.env.local` / CIのビルド環境 | 決定した本番HTTPSオリジン。canonicalとOG画像URL |
| `VITE_APP_STORE_URL` | 同上 | 公開後のApp Store URL |
| `VITE_GOOGLE_PLAY_URL` | 同上 | 公開後のGoogle Play URL |

`VITE_*` は公開される値です。OAuthの秘密鍵・クライアントシークレット等は入れません。ストアURLが空なら公開準備中と表示します。ドメイン未設定ではcanonicalを出しません。招待ページはサーバー（`apps/server`、Worker名 `pochical-server`）にService Bindingで問い合わせます。ローカルでは `mise run server` を並べて起動してください。起動していなければ、招待ページは「確認できませんでした」と表示します。開発用 `.env.local` のURLを本番ビルドに混ぜないよう、本番はCIで設定してください。

## Webからのアカウント削除

新しいサーバーにはまだ認証がないため、削除はメールで受け付けています（ストアが求める、アプリの外から削除を依頼できる窓口）。認証ができたら、Webでの本人確認と削除をここに戻します。

## 公開前に設定するもの

- 専用ドメインと本番用の上記環境変数
- 実際に公開されたストアURL
- Apple/Googleで、アプリと同じアカウントになることの実環境確認
- Webでの本人確認つき削除（認証ができてから）
- 規約・プライバシー表記の運用確認。運営名・窓口は旧サイトのCHIJI TECHと連絡先を使用。外部サービスのログ・バックアップの保持期間など、実際の契約・設定で決まる事項を公開前に確認する。

公開はmainへのマージでWorkers Buildsが行います（ビルドコマンド `bun run build`、デプロイコマンド `bunx wrangler deploy`、ルートディレクトリ `apps/web`）。`wrangler deploy` はビルドが書き出す `dist/server/wrangler.json` を使います。事前確認には `bun run build` のあと `bun x wrangler deploy --dry-run` を利用できます。
