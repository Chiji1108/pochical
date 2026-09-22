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

画像保存に使う `react-native-view-shot@6.0.1` には、ExpoとReact Nativeのstyle型の不一致を修正するパッチを適用しています。React Nativeの型互換モードは不要です。パッチは `bun install` 時に自動適用されます。

絵文字選択は `expo-native-sheet-emojis@2.1.2` を使います。シフトとグループのアイコン選択で共通のネイティブシートを開き、アプリの配色と日本語の表示ラベルを適用します。日本語検索辞書は `app.json` の `searchLocales: ["ja"]` で追加しています。導入前の開発用アプリでは動かないため、`bunx expo prebuild --clean` で旧MCEmojiPickerの設定を除去し、`bun run ios` または `bun run android` で再ビルドしてください。

## 参考情報

- [Expo SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)
- [Expoローカル開発](https://docs.expo.dev/guides/local-app-development/)
- [Uniwind Pro](https://docs.uniwind.dev/migrate-to-pro)
