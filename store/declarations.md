# Declarations

The answers to the stores' forms beside the listing, drafted from the code and the privacy policy (`apps/web/src/components/legal-document.astro`). An answer changes here in the PR that changes what the app does.

## Both stores

- **Category**: 仕事効率化 (Productivity).
- **Price**: free, with no in-app purchases and no ads. Neither app has an ad SDK or a billing library.
- **Sign-in**: none needed. The app starts with an anonymous account; Apple or Google sign-in is optional, to use the same data on another device.
- **Account deletion**: in the app (設定 › アカウント › アカウントを削除), and by mail from `https://pochical.app/account/delete`.
- **User-generated content**: yes. Members of a group chat with each other, in the group and one to one, with photos. A message or a member can be reported (通報) and a member blocked (ブロック) (spec/chat.md); the terms forbid harassment and unlawful content; reports reach the operator, who can suspend an account (spec/admin.md).
- **Languages**: Japanese only.

## App Store: App Privacy

The same list as `apps/ios/Pochical/Pochical/PrivacyInfo.xcprivacy`, which changes with it. Every type is linked to the user, used for App Functionality only, and not used for tracking.

| Data type | What it is here |
| --- | --- |
| Contact Info › Name | The display name; the name Apple or Google gives on sign-in |
| Contact Info › Email Address | The address Apple or Google gives on sign-in |
| Identifiers › User ID | The account's id |
| User Content › Photos or Videos | The profile photo; photos sent in a chat |
| User Content › Other User Content | Shifts, patterns, memos, coworkers' names, chat messages and reactions |
| User Content › Customer Support | Messages to the operator, with the app's version, the device's model and the OS version |

Not collected: location, contacts, health, financial, browsing or search history, purchases, usage data, diagnostics, advertising data. The push token is a device token used only to deliver notifications; App Store Connect's Device ID means an identifier used across apps, so it is not declared.

## App Store: the rest

- **Export compliance**: `ITSAppUsesNonExemptEncryption` is `NO` in the build settings; the app uses only the system's HTTPS.
- **Age rating**: answer the questionnaire as an app with user-generated content and messaging between users, moderated by reports and blocks; no gambling, no violence, no web browsing (links open in the system's browser), no ads.
- **App Review Information** (#796): untick サインインが必要. Notes:

  ```
  No sign-in is required: the app starts with an anonymous account. Sign in with Apple or Google (設定 › アカウント) is optional and only links the data to that account for use on other devices.
  Account deletion: 設定 › アカウント › アカウントを削除.
  Groups and chat can be tried on one device: グループ tab › + to create a group, then open 全体チャット. Inviting others needs a second device or the invitation link.
  Reporting and blocking: long-press a message › 通報; a member's profile › ブロック.
  ```

  Read the menu names against the build that is submitted.

## Google Play: Data safety

Collected, not shared with third parties, encrypted in transit, and deletable (in the app and at the deletion page). Each is for App functionality, and Account management where it is the account's.

| Data type | What it is here |
| --- | --- |
| Personal info › Name | The display name; the name Apple or Google gives |
| Personal info › Email address | The address Apple or Google gives |
| Personal info › User IDs | The account's id |
| Photos and videos › Photos | The profile photo; photos sent in a chat |
| Messages › Other in-app messages | Chat messages and reactions; messages to the operator |
| App activity › Other user-generated content | Shifts, patterns, memos, coworkers' names |
| App info and performance › Diagnostics | The app's version and the device's model with a message to the operator |
| Device or other IDs | The Firebase Cloud Messaging token that notifications are sent to |

Service providers that process the data for the app (Cloudflare, Firebase Cloud Messaging, Slack for messages to the operator) are not sharing as the form defines it.

## Google Play: the rest

- **Ads**: no.
- **App access**: all of the app is open without signing in.
- **Target audience**: 13 and over at the least; the app is not for children. The owner picks the age groups.
- **Content rating (IARC)**: users can interact and exchange content; no location sharing; no purchases.
- **Data deletion URL**: `https://pochical.app/account/delete#data`.

## To check in the build before answering

- The merged release manifest has no `com.google.android.gms.permission.AD_ID`.
- What the bundled ML Kit barcode scanner sends to Google (its data disclosure page), and whether Data safety's Diagnostics must name it.
- `READ_CALENDAR` is read only to list calendars and find the app's own events; nothing of it leaves the phone.
- The deletion page says the data that can be removed while keeping the account is removed from the iOS app, and by mail on Android. Read it against the Android build.
