# ポチカル

SwiftUI・Jetpack Compose・Cloudflare Workersで作る多言語のモノレポです。ツールのバージョンとタスクは [mise](https://mise.jdx.dev) で管理し、TypeScriptのパッケージはBun workspacesで管理します。

```text
proto/           通信のスキーマ（Protobuf）。buf generateで各アプリにコードを生成
spec/            同期の手順など、各プラットフォームで共有する仕様
apps/
  server/        Cloudflare Workers + Durable Objects（Connect RPC・WebSocket）
  ios/           SwiftUIアプリ
  android/       Jetpack Composeアプリ
  web/           TanStack Start製の専用サイト。LP・招待・アカウント削除など
  mobile-legacy/ 旧Expoアプリ。参照用で、ビルド・テストの対象外
patches/         Bunが適用する依存パッケージのパッチ
```

## 開発

リポジトリのルートで `mise install` と `bun install` を実行します。

| ルートで実行するコマンド | 内容 |
| --- | --- |
| `mise run gen` | `proto/` からTypeScript・Swift・Kotlinのコードを生成 |
| `mise run proto:lint` | `proto/` のlintと整形チェック |
| `mise run server` | サーバーの開発環境を起動 |
| `mise run server:test` | サーバーのテストをWorkersのランタイムで実行 |
| `bun run web` | Webの開発サーバーを起動 |
| `bun run build:web` / `bun run preview:web` | Webのビルド・プレビュー |
| `bun run typecheck` | Web・サーバーの型チェック |
| `bun run test` | Web・サーバーのテスト |
| `bun run check` / `bun run fix` | TypeScriptのコードチェック・整形 |

Webの開発・公開設定は [WebのREADME](apps/web/README.md) を参照してください。アカウント削除ページは、新しいバックエンドに移るまで `apps/mobile-legacy/convex` の生成済みAPIの型を参照しています。
