# ポチカル

SwiftUI・Jetpack Compose・Cloudflare Workersで作る多言語のモノレポです。ツールのバージョンとタスクは [mise](https://mise.jdx.dev) で管理し、TypeScriptのパッケージはpnpm workspacesで管理します。

```text
proto/           通信のスキーマ（Protobuf）。buf generateで各アプリにコードを生成
spec/            同期の手順など、各プラットフォームで共有する仕様
apps/
  server/        Cloudflare Workers + Durable Objects（Connect RPC・WebSocket）
  ios/           SwiftUIアプリ
  android/       Jetpack Composeアプリ
  web/           Astro製の専用サイト。LP・招待・アカウント削除など
```

## 開発

リポジトリのルートで `mise install` と `pnpm install` を実行します。

| ルートで実行するコマンド | 内容 |
| --- | --- |
| `mise run gen` | `proto/` からTypeScript・Swift・Kotlinのコードを生成 |
| `mise run proto:lint` | `proto/` のlintと整形チェック |
| `mise run server` | サーバーの開発環境を `http://localhost:8787` で起動（`-- --port <n>` で別のポート。先に `apps/server/.dev.vars` に `BETTER_AUTH_SECRET=<32文字以上のランダムな値>` を書く） |
| `mise run server:test` | サーバーのテストをWorkersのランタイムで実行 |
| `mise run api:try -- create [名前] [絵文字]` | 本番のサーバーで、匿名ユーザーとしてグループを作り招待リンクを表示する。続けて `join`・`preview`・`remake`、最後に `cleanup` で後片付け（`--local` でローカル） |
| `pnpm run web` | Webの開発サーバーを起動 |
| `pnpm run build:web` / `pnpm run preview:web` | Webのビルド・プレビュー |
| `pnpm run typecheck` | Web・サーバーの型チェック |
| `pnpm run test` | Web・サーバーのテスト |
| `pnpm run check` / `pnpm run fix` | TypeScriptのコードチェック・整形 |

Webの開発・公開設定は [WebのREADME](apps/web/README.md) を参照してください。

## ライセンス

ソースコードは [PolyForm Strict License 1.0.0](LICENSE) で公開しています。読むことや、個人の学習など非商用の目的で使うことはできますが、改変・再配布・商用利用は許可していません。

「ポチカル」「Pochical」の名前、ロゴ、アプリアイコン、キャラクター（PeekingPoodleなど）はこのライセンスの対象外で、使用を許可していません。

同梱しているサードパーティの素材とそのライセンスは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にあります。

## コントリビューション

外部からのプルリクエストは受け付けていません。脆弱性の報告は [SECURITY.md](SECURITY.md) を参照してください。

## リンク

- [pochical.app](https://pochical.app)：公式サイト
- [try.pochical.app](https://try.pochical.app)：プロトタイプ
- [design.pochical.app](https://design.pochical.app)：デザインドキュメント
