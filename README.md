# ポチカレ

Expo SDK `58.0.0-preview.4` / React Native `0.88.0-rc.1` を使用しています。

## iOSでのローカル開発

XcodeとiOSランタイム、Bun、Node.js（22.13以上の22系、24.3以上の24系、または26以上）が必要です。

1. `bun install` で依存関係をインストールします。
2. Uniwind Proを初めて使うMacでは `bunx uniwind-pro` で認証し、本体を取得します。
3. `.env.local` に `EXPO_PUBLIC_INSTANT_APP_ID` と `EXPO_PUBLIC_CONVEX_URL` を設定します。
4. `bun run ios --device` でiOS Simulatorを選択し、開発用アプリをビルド・起動します。Xcode 27ではDevice Hubが開きます。

初回ビルド後は `bun run start` を実行し、`i` キーで起動できます。ネイティブ依存関係を更新したときは再ビルドしてください。

`ios/` と `android/` は自動生成され、Gitでは管理しません。SDK更新後は `bunx expo prebuild --platform ios --clean` で再生成してからビルドします。ネイティブのカスタマイズは `app.json` と `plugins/` で管理します。

検証コマンド：`bunx expo-doctor`、`bunx expo install --check`、`bunx tsc --noEmit`、`bun run check`。

画像保存に使う `react-native-view-shot` が旧型定義に依存するため、`tsconfig.json` ではReact Nativeの型互換モードを有効にしています。ライブラリが新しい型定義に対応したら、この設定を外して再検証してください。

`patches/` の絵文字ピッカー用パッチは、React Nativeの事前ビルド済みフレームワークからヘッダーを読み込むための修正です。`bun install` 時に自動適用されます。

## 参考情報

- [Expo SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)
- [Expoローカル開発](https://docs.expo.dev/guides/local-app-development/)
- [Uniwind Pro](https://docs.uniwind.dev/migrate-to-pro)
