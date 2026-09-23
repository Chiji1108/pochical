# ポチカレ

Expo SDK `58.0.0-preview.5` / React Native `0.88.0-rc.1` を使用しています。

## iOSでのローカル開発

XcodeとiOSランタイム、Bun、Node.js（22.13以上の22系、24.3以上の24系、または26以上）が必要です。

1. `bun install` で依存関係をインストールします。
2. Uniwind Proを初めて使うMacでは `bunx uniwind-pro` で認証し、本体を取得します。
3. [Convex・認証のセットアップ](docs/convex-migration.md) を行い、`.env.local` に `CONVEX_DEPLOYMENT` と `EXPO_PUBLIC_CONVEX_URL` を設定します。
4. `bun run ios --device` でiOS Simulatorを選択し、開発用アプリをビルド・起動します。Xcode 27ではDevice Hubが開きます。

初回ビルド後は `bun run start` を実行し、`i` キーで起動できます。ネイティブ依存関係を更新したときは再ビルドしてください。

`ios/` と `android/` は自動生成され、Gitでは管理しません。SDK更新後は `bunx expo prebuild --platform ios --clean` で再生成してからビルドします。ネイティブのカスタマイズは `app.json` と `plugins/` で管理します。

Uniwind Proの依存関係が再インストールされた場合、npmパッケージがインストーラーだけの状態に戻ることがあります。`node_modules/uniwind/Uniwind.podspec` が存在することを確認してからiOSを生成してください。存在しない場合は `bunx uniwind-pro` で本体を取得します。本体の取得前に `pod install` を実行していた場合は、取得後に `cd ios && pod install` を再実行してからアプリを再ビルドしてください。省略すると `UniwindConfig` が登録されず、起動時にスプラッシュ画面から進まなくなります。`plugins/with-uniwind-native-check.cjs` は、本体がない状態でのPodインストールをエラーにして防ぎます。

検証コマンド：`bunx expo-doctor`、`bunx expo install --check`、`bunx tsc --noEmit`、`bun run check`。

画像保存に使う `react-native-view-shot@6.0.1` には、ExpoとReact Nativeのstyle型の不一致を修正するパッチを適用しています。React Nativeの型互換モードは不要です。パッチは `bun install` 時に自動適用されます。

### iOSの日本語変換の下線

`react-native@0.88.0-rc.1` に、[RN PR #56082](https://github.com/react/react-native/pull/56082) の実行コードの全変更を移植しています。移植元は `0ca175504ec2c6504628e327ccff9c5d8076cb56` です。対象は `RCTUITextField.mm`、`RCTUITextView.mm`、`RCTTextInputComponentView.mm` の3ファイルで、RN 0.88で削除済みのimportに合わせてパッチのコンテキストを調整しています。

単一行・複数行の下線復元に加え、確定後の入力属性更新から不要な属性を除去し、変換中の属性変更を保留します。変換中の文字列・選択範囲の上書きとFabricへの状態同期を抑制し、複数行の変更判定を文字列ベースに変更します。文字数制限は変換後に適用し、絵文字などを途中で分割しないよう処理します。以前の原因7aだけのパッチを置き換えるものです。

PRは未マージです。変換中のJSからの値変更は保留キューへ保存するのではなくスキップされ、確定後の再同期に依存します。また変換中のFabric状態同期を抑制するため、送信・クリアと複数行の高さ更新は実機での確認が必要です。上流のJSテストおよびRNTesterのXCTestはReact Nativeリポジトリ専用のテスト環境に属するため、このアプリの依存パッチには含めず、上記コミットを参照します。ネイティブビルドの成功だけで日本語IMEの動作確認済みとは扱いません。

`bun install` でパッチが自動適用され、`plugins/with-ios-ime-patch.cjs` がiOSのReact Nativeをソースからビルドするよう設定します。ビルド済みのReact Nativeではこの修正が反映されないため、初回ビルドは従来より時間がかかります。`RCT_USE_PREBUILT_RNCORE=1` / `RCT_USE_RN_DEP=1` を環境変数で強制しないでください。

既存の開発環境では `bunx expo prebuild --platform ios --no-install`、`cd ios && pod install`、プロジェクト直下で `bun run ios` を順に実行してください。Metroの再起動やOTA更新だけでは反映されません。

再ビルド後は、日本語キーボードでHeroUIの単一行入力とチャットの複数行入力を確認します。「入力→候補選択→確定→追記」を3回以上繰り返し、毎回変換中の下線が表示されることを確認してください。さらに、フォーカスを外して再入力、文中編集時のカーソル、変換途中の送信とクリア、変換中・確定後の複数行の伸縮、文字数制限、貼り付け・絵文字を確認してください。送信の検証は自分宛てなどの検証用チャットで行ってください。

RN更新時はパッチの適用先と本体での修正状況を確認します。本体で修正されたバージョンへ移行したら、`patchedDependencies` のRN項目、対応するパッチファイル、上記プラグインと登録を削除し、iOSを再生成・再ビルドして確認してください。

絵文字選択は `expo-native-sheet-emojis@2.1.2` を使います。シフトとグループのアイコン選択で共通のネイティブシートを開き、アプリの配色と日本語の表示ラベルを適用します。日本語検索辞書は `app.json` の `searchLocales: ["ja"]` で追加しています。導入前の開発用アプリでは動かないため、`bunx expo prebuild --clean` で旧MCEmojiPickerの設定を除去し、`bun run ios` または `bun run android` で再ビルドしてください。

## 参考情報

- [Expo SDK 58 beta](https://expo.dev/changelog/sdk-58-beta)
- [Expoローカル開発](https://docs.expo.dev/guides/local-app-development/)
- [Uniwind Pro](https://docs.uniwind.dev/migrate-to-pro)
