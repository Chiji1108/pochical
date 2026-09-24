# ポチカレ

Bun workspacesで管理するモノレポです。

```text
apps/
  mobile/     Expoアプリ。Convex、テスト、アプリの開発資料もここに配置
  web/        LP・招待リンクなどのWebサイト用。現在は .gitkeep のみ
patches/      Bunが適用する依存パッケージのパッチ
```

Convexは独立したパッケージにせず、`apps/mobile/convex` に置いています。
Webのフレームワークや依存関係はまだ追加していません。

## 開発

リポジトリのルートで `bun install` を実行します。依存関係はルートの
`node_modules` に配置し、`bun.lock` と `patches/` もルートで管理します。

| ルートで実行するコマンド | 内容 |
| --- | --- |
| `bun run start` | モバイルの開発サーバーを起動 |
| `bun run ios --device` | iOSの開発用アプリをビルド・起動 |
| `bun run android` | Androidの開発用アプリをビルド・起動 |
| `bun run convex` | モバイルに含まれるConvexの開発環境を起動 |
| `bun run typecheck` | モバイルの型チェック |
| `bun run test` | モバイルのテスト |
| `bun run check` / `bun run fix` | リポジトリ全体のコードチェック・整形 |

環境変数は `apps/mobile/.env`、`apps/mobile/.env.local` に置きます。
Expo、EAS、ConvexのCLIを直接使う場合は、先に `cd apps/mobile` してください。
詳細は [モバイルの開発手順](apps/mobile/README.md) を参照してください。

## 既存チェックアウトの移行

移行前の環境変数ファイルがルートに残っている場合は、上記の場所に移してください。
移行前に生成した `ios/`・`android/` は古いパスを含むため、そのまま使わず
`apps/mobile` で `bunx expo prebuild --clean` を実行して再生成し、再ビルドしてください。
初回の開発サーバー起動は `bun run start --clear` でキャッシュを更新します。

`apps/web` にWebプロジェクトの `package.json` を追加すると、既存の
`apps/*` の設定でworkspaceとして認識されます。
