# Store listings

What the App Store and Google Play show of ポチカル, kept here to be reviewed like code and entered into App Store Connect and Play Console by hand. Nothing uploads it.

The listing speaks to people who work nights and rotating shifts, young nurses first, in the order they would use the app: entering, the calendar, the phone's own calendar, the widgets, sharing, the chat, the look.

## Where each file goes

| File | App Store Connect | Play Console |
| --- | --- | --- |
| `ja/app-store/name.txt` | 名前 (30) |  |
| `ja/app-store/subtitle.txt` | サブタイトル (30) |  |
| `ja/app-store/promotional_text.txt` | プロモーション用テキスト (170) |  |
| `ja/app-store/keywords.txt` | キーワード (100) |  |
| `ja/google-play/title.txt` |  | アプリ名 (30) |
| `ja/google-play/short_description.txt` |  | 簡単な説明 (80) |
| `ja/description.txt` | 説明 (4000) | 詳しい説明 (4000) |

The pages the forms ask for are the site's: サポート `https://pochical.app/support`, マーケティング `https://pochical.app`, プライバシーポリシー `https://pochical.app/privacy`, アカウントの削除 `https://pochical.app/account/delete`.

`declarations.md` holds the answers to the forms beside the listing: what data is collected, the ratings' questions, the notes for review.

## What the words keep to

- Only what both apps do. What iOS alone has (the Lock Screen's widgets, the tinted and clear looks, the choice of app icon) stays out.
- No price and no rank (無料, No.1, 人気), which both stores turn down in a listing, and no 安全 or 保存しない: the source is public, and that is all the listing says of trust.
- 同期 and 連携 are not said of the phone's calendar: shifts go into it one way.
- Other apps are not named, but for Googleカレンダー, which the phone's calendar carries shifts to.

`apps/design/tests/store-listing.test.ts` holds each text to its limit and to these words. App Store Connect's own counter has the last word: check キーワード there, as it has been counted in bytes at times.
