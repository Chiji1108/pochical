# Convex・Apple・Googleのセットアップ

この作業で既存の `dev:veracious-buffalo-766` をリセットし、Convexへの反映・署名鍵設定・匿名認証の接続検証を完了。以下の「1」は別環境での再設定用。次に必要なのはGoogle/Appleの設定。

## 今回の構成

- 認証は Convex Auth。初回は匿名ログイン。
- `@convex-dev/auth@0.0.95` にBunパッチを適用。匿名→正式アカウントの切り替え時、JWTのsubject（ユーザー・セッション）が変わったら購読を再認証する。通常のトークン更新では再認証を繰り返さない。上流更新時は `tests/auth-account-switch.test.tsx` で確認してパッチを見直す。
- シフト・パターン・勤務メンバーは MMKV に保存し、Replicate の Convex component で Yjs の変更を同期する。
- `@trestleinc/replicate@2.0.0-preview.0` を固定。型定義のexport不足は `tsconfig.json` のパスマッピングで補っている。公開クライアントの共有ストリームは使わず、認証したユーザーからサーバーが同期領域を決定する。
- アプリ独自の永続送信キューは、通信完了前にアプリを終了しても変更・削除を再送する。別の端末の異なるフィールドへの変更は CRDT で統合する。同じフィールドの同時変更は Yjs の競合解決に従う。
- グループ・チャットも Convex Auth の本人情報でアクセス制御。共有カレンダーには個人メモ・勤務メンバーを返さない。
- Google は `react-native-nitro-google-signin@2.3.0`、iOS の Apple は `expo-apple-authentication`。Android の Apple と Web はブラウザー経由の OAuth。
- ネイティブのIDトークンはConvexで署名・発行元・宛先・期限・nonceを検証。認証要求は5分有効・一度限り。同じprovider/subを使い、Webとネイティブでアカウントを共通化する。メールアドレスでの自動統合はしない。
- 連携は10分有効の一度限りの秘密情報で認証前後を結ぶ。認証ユーザーIDとカレンダー所有者IDを分け、匿名時のカレンダーを移動せず維持する。
- Apple／Googleそれぞれ「続ける」ボタンに統一。認証開始後に新規作成されたアカウントなら元のカレンダーを引き継ぐ。登録済みアカウントは空のカレンダーでもそのまま開き、匿名データの上書き・自動マージはしない。

## 1. Convex の開発環境

既存データは移行しない。**既存のスキーマと互換性がない**ため、新しい開発デプロイメントを使うか、開発データを削除してから適用する。削除対象を確定するまでは実行しない。

1. `bun x convex dev --configure` でログインし、対象プロジェクト・開発デプロイメントを選択する。
2. 作成された `.env.local` の `CONVEX_DEPLOYMENT` を確認する。
3. アプリの `EXPO_PUBLIC_CONVEX_URL` を同じデプロイメントの `.convex.cloud` URL にする。古い `.env` の URL と食い違わないようにする。
4. `bun x @convex-dev/auth` で `JWT_PRIVATE_KEY` と `JWKS` を設定する。既に実装してある `auth.ts`・`auth.config.ts`・`http.ts` はそのまま使う。React Nativeでは `SITE_URL` は不要。
5. `bun x convex dev --once` でサーバー反映・型生成を行う。

`EXPO_PUBLIC_INSTANT_APP_ID` は不要なので削除してよい。秘密情報は `EXPO_PUBLIC_` に入れない。

まず匿名ログインだけで、作成・アプリ再起動・機内モードで編集・通信復帰を確認できる。

## 2. Google を新規作成

Firebaseは不要。同じ[Google Cloudプロジェクト](https://console.cloud.google.com/auth/overview)で以下の3種類を作る。

1. Google Auth Platformでアプリ名・サポートメール・連絡先を設定。一般向けはAudienceをExternalにし、開発中はTest usersに使うアカウントを追加。
2. Clients → Create client → **Web application**。このClient IDを次の両方に設定する（同じ値）：
   - ローカル `.env.local`: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   - Convex Dashboard → Settings → Environment Variables: `AUTH_GOOGLE_ID`
3. **Android**クライアントを作り、Package nameを `tech.chiji.pochical`、SHA-1をアプリ署名証明書のものにする。debug・releaseで署名が違えばそれぞれ登録。Google Play配布時はPlay Consoleの **App signing key certificate** のSHA-1も登録する。
   - ローカル署名の確認: `cd android && ./gradlew signingReport`。
   - AndroidクライアントIDを `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` に入れない。
4. **iOS**クライアントを作り、Bundle IDを `tech.chiji.pochical` にする。Client IDを `.env.local` の `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` に設定。
5. `app.config.ts` がiOS Client IDからURLスキームを自動生成する。IDを追加・変更したら `bun x expo prebuild` とネイティブ再ビルドが必要。

```dotenv
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
```

これらのClient IDは公開情報。**Client secretはアプリの環境変数に入れない**。ネイティブGoogleログインにはClient secretは不要。

Web版も使う場合のみ、WebクライアントのAuthorized redirect URIsに
`https://veracious-buffalo-766.convex.site/api/auth/callback/google` を追加し、Client secretをConvexの `AUTH_GOOGLE_SECRET` に設定する。

Googleの設定ファイル (`google-services.json` / `GoogleService-Info.plist`) は不要。ID未設定時はGoogle認証を開始せず、設定未完了のメッセージを表示する。

## 3. Apple を新規作成

Apple Developer Program のアカウントが必要。

### iOSのネイティブログイン

1. Apple DeveloperのApp ID `tech.chiji.pochical` で **Sign in with Apple** を有効化する。
2. Convexの `AUTH_APPLE_NATIVE_ID` を `tech.chiji.pochical` に設定する。
3. `app.config.ts` は `usesAppleSignIn: true` とExpoプラグインを設定済み。署名プロファイルにもSign in with Appleを反映し、再ビルドする。

iOSネイティブだけならService ID・`.p8`・client secretは不要。氏名には依存せず、検証済みトークンのsubで識別する。

### Android／WebのAppleログイン

以下のWeb OAuth設定も行う。Service IDを上記の同じApp IDに関連付けることで、iOSとAndroidのAppleアカウント識別子を揃える。

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) で App ID `tech.chiji.pochical` の **Sign in with Apple** を有効化。すでにApp IDがある場合はそれを使う。
2. Services IDs で新規IDを作成（例：`tech.chiji.pochical.auth`）。Sign in with Apple を有効化し、上記 App ID に関連付ける。
3. Service ID の設定で次を登録：
   - Domains and Subdomains: `veracious-buffalo-766.convex.site`
   - Return URLs: `https://veracious-buffalo-766.convex.site/api/auth/callback/apple`
4. Keys で Sign in with Apple 用のキーを作成し、同じ App ID に紐付ける。`.p8` を安全な場所にダウンロードする。
5. Convex Dashboard の Environment Variables に設定（開発・本番は別々に設定する）：
   - `AUTH_APPLE_ID`: Service ID（Bundle IDではない）
   - `AUTH_APPLE_TEAM_ID`: Apple Developer の Team ID
   - `AUTH_APPLE_KEY_ID`: ダウンロードしたキーの Key ID
   - `AUTH_APPLE_PRIVATE_KEY`: `.p8` の内容全体（BEGIN/END行を含む）。実際の改行、文字列の `\n` のどちらも利用可能。
6. アプリの「Appleと連携」で確認する。Androidでログアウト後の再ログインと、iOSと同じアカウントに戻れることを確認する。

`convex-lib/appleAuthProvider.ts` が Apple のトークン交換直前に、有効期間5分の client secret（ES256 JWT）を毎回生成する。定期ジョブ・180日ごとのSecret更新・アプリ再配布は不要。`.p8` はサーバー側の環境変数だけに保存し、`EXPO_PUBLIC_*`・Git・アプリのバンドルには含めない。Apple側でキーを失効させた場合は、新しい秘密鍵とKey IDへ更新する。

### 既存の固定Secretからの移行

1. 自動生成対応コードをデプロイする。新しい3項目がすべて未設定なら、既存の `AUTH_APPLE_SECRET` を引き続き使用する。
2. `AUTH_APPLE_TEAM_ID`・`AUTH_APPLE_KEY_ID`・`AUTH_APPLE_PRIVATE_KEY` をまとめて設定する。CLIの `bun x convex env set --from-file /安全な場所/apple.env` で複数項目を一括設定できる（本番には `--prod` を付ける）。ファイルには今回設定する項目だけを入れ、リポジトリ外に置いてアクセス権を制限し、設定後に削除する。
3. AndroidでAppleログインを確認し、不要になった `AUTH_APPLE_SECRET` を削除する。

新しい3項目のどれかが設定されると自動生成を使う。不足・不正な鍵がある場合はエラーにし、古いSecretには戻さない。途中状態を避けるため、3項目を一括設定する。

旧 `scripts/create-apple-secret.mjs` は手動運用の補助として残している。このスクリプトのSecretは180日で失効するため、自動生成への移行前は期限管理が必要。`.p8` 自体を `AUTH_APPLE_SECRET` に貼り付けない。

## 4. 実機での確認

1. 匿名でパターン・シフト・メモを作る。
2. アプリを終了し、機内モードで起動して同じデータを開く。
3. オフラインで編集・削除して終了。オンラインで再起動して同期を確認。
4. Apple/Googleと連携して匿名時のデータが残ることを確認。
5. 別端末の「Appleで続ける」または「Googleで続ける」で同じデータを取得。
6. 2台で異なるフィールドを変更し、両方に反映されることを確認。
7. グループ・DMの表示と送信、グループから外れた後の共有カレンダーのアクセス拒否を確認。

Web OAuthの戻り先は `pochical://auth`。Expo Goではなく、**ネイティブライブラリ追加後に再ビルドした**開発版またはリリース版を使う。

```sh
bun x expo prebuild
bun x expo run:android --variant release
bun x expo run:ios --configuration Release --device
```

iOSのGoogle SDKへのURL引き渡しは `plugins/with-native-auth.cjs` で再生成可能。Expo 58のSceneDelegateはAppDelegateにもイベントを転送するため、その受け口でGoogleへ渡し、それ以外はExpoの処理を維持する。

Googleの認証はAndroidで `signIn` → 保存済み認証がなければ `createAccount` → `presentExplicitSignIn`。iOSは古いnonceのトークンを再利用しないよう、`createAccount` の対話フローから開始する。キャンセルはエラー表示しない。

Google 2.3.0の公開対応表にRN 0.88は未記載。ポチカレでのビルド検証と、資格情報設定後の実機ログイン確認を分けて扱う。

## ネイティブログイン追加後の確認

- 自動テスト11件。署名・発行元・宛先・期限・nonceの検証、認証要求の期限・一度限りの消費、Webとネイティブのアカウント共通化、メール一致での自動統合禁止を追加。
- TypeScriptとUltraciteは通過（既存の型再exportに関するinfoのみ）。
- Convexへ反映済み。実サーバーがAppleの公開鍵を取得し、不正な署名を拒否することを確認。
- 設定の検証でAppleのentitlementとGoogleのiOS URLスキーム生成を確認。
- Android arm64リリースビルド成功。接続中の実機にインストールし、起動・アカウント画面のGoogle標準ボタン表示・Client ID未設定時の案内を確認。
- iOS実機向けReleaseビルド成功（署名なしでコンパイル・リンクを確認。実機へのインストールとログインは未確認）。
- Google/Appleの実アカウントによる認証成功・引き継ぎは、外部設定後の実機確認が必要。

## 前回のDB移行時に確認済み（ネイティブログイン追加前）

- TypeScript・Ultraciteチェック、8件の自動テスト。
- 実サーバーで匿名認証、JWT検証、同期データの保存・取得・ユーザー分離。
- 実サーバーでグループ作成、招待参加、グループ/DM送信、退会後の共有データアクセス拒否。
- Androidリリースビルド・実機起動。パターン追加とシフト入力、強制終了後の復元、確認用データのリセット。
- iOSのJSバンドル生成。今回の変更のiOS実機動作は未確認。
- Apple/Googleの実ログインは資格情報の設定後に確認する。

## 検証・現時点の制約

- `bun test`：ローカル永続化・再送、CRDT競合・削除、ユーザー分離、共有カレンダーの所属確認、アカウント引き継ぎを検証。
- `bun x tsc --noEmit` / `bun x ultracite check`。
- `bun x expo export --platform android --platform ios`：JSバンドル確認。実機起動の確認とは別。
- 初回ログイン・Apple/Googleログイン・グループ/チャットには通信が必要。
- 同期は利用者ごとの全レコードの状態を購読する初期実装。大量データでの通信量・Convex読み取り量はまだ測定していない。
- 機種変更で引き継げるのは同期済みのデータ。端末内の未送信データには元の端末が必要。
- プロバイダー設定後、Apple/Googleの成功・キャンセル・再ログイン・匿名データ引き継ぎを実機で最終確認する。AndroidはGoogle Play内部テスト配布でも確認する。

参考：[Convex Auth Setup](https://labs.convex.dev/auth/setup)、[Google](https://labs.convex.dev/auth/config/oauth/google)、[Apple](https://labs.convex.dev/auth/config/oauth/apple)。
