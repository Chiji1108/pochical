# Repository Guide

Pochical is a monorepo: native SwiftUI (`apps/ios`) and Jetpack Compose (`apps/android`) apps, a Cloudflare Workers backend (`apps/server`), the web site and its /design prototype (`apps/web`), and the admin site (`apps/admin`).

## Where things live

- Tool versions and tasks are in `mise.toml` (`mise run gen`, `mise run server:test`, `mise run ios:test`, ...).
- Generated files are never edited by hand; change their source and regenerate:
  - Wire types: `proto/` → `mise run gen` (into `apps/server/src/gen`, `apps/web/src/gen`, `apps/ios/Packages/PochicalProto/Sources`, `apps/android/proto/src/main`).
  - Numbers every platform shares (limits, the chat's, days', invites', sockets', widgets'), design tokens, mark icons and holidays: `design/` → `mise run gen` (into `spec/design-tokens.json`, `apps/ios/Packages/PochicalDesign/Sources`, `apps/android/design/src/main`). Specs and code refer to them by name, never by value.
  - Icons: the marks' paths from Phosphor via `bun run --cwd design icon:marks`; the iOS app icons and the widgets' `PeekingPoodle` via `bun run --cwd apps/web icon:ios`.
  - SQL schemas are Drizzle and their migrations are generated, never written: D1 `apps/server/src/db/schema.ts` (`mise run db:generate -- --name <what>`; better-auth's tables via `mise run auth:schema` first), the Group DO `group-do-schema.ts` (`mise run group-do:generate`), the User DO `user-do-schema.ts` (`mise run user-do:generate`). CI runs `mise run db:check`.
- Behavior shared across platforms is specified in `spec/`. Logic every platform writes again is pinned by `spec/vectors/*.json`, read by `apps/web/tests/vectors.test.ts`, `apps/server/test/vectors.test.ts` and PochicalKit's tests; a new case goes in the JSON, not in one platform's test. Components are not generated: each platform builds its own, with /design as the reference.
- iOS: `apps/ios/Pochical/Pochical.xcodeproj` (app and widgets, App Group `group.app.pochical`). Hand-written shared code goes in `apps/ios/Packages/PochicalKit` (`mise run ios:test`). `xcodebuild` needs `-skipMacroValidation`. A Debug build in the simulator talks to `mise run server` at `http://localhost:8787`, which needs `apps/server/.dev.vars` (`BETTER_AUTH_SECRET`, any random value, and `BETTER_AUTH_URL=http://localhost:8787`; the `SLACK_*` secrets only to post to Slack from this computer, and wrangler warns while they are absent) and the D1 migrations applied locally (`bunx wrangler d1 migrations apply pochical --local` in `apps/server`).
- Admin (spec/admin.md): `apps/admin` reaches the server only through `AdminEntrypoint` (`apps/server/src/admin-entrypoint.ts`), bound as `SERVER`, whose types come from the server's source (`bun run --cwd apps/admin cf-typegen`); `mise run admin` serves it at `http://localhost:3100`.

## How to build

- Plumbing comes from a maintained library before it is hand-written (check license, activity, fit; name it in the PR). MIT/Apache/BSD may be added; GPL/AGPL code (Signal, Telegram) is read for ideas only.
- What does the same thing in two places is one piece, not two copies: build on the existing one and make the difference an input. A change to one carries to the others in the same PR.
- Fix the root cause the way the platform or library intends; no timing hacks, sleeps or patches over symptoms. If the conventional answer is to leave a review finding, say so instead of adding special handling.
- The apps are unreleased: change stored shapes directly, with no hand-written data migration, fallback or compatibility code for old saved data. On iOS that means editing a table where it is first created, never adding a migration step: any schema change erases the device's database in every build, TestFlight included, and it syncs again from the server. Server SQL schemas still get their generated Drizzle migrations, as above. At release, turn iOS's erasing off and append migration steps from then on.
- Update `spec/` (and its vectors) in the same PR as any behavior change; fix spec drift when you see it.
- UI follows the platform first (iOS 26 / Material 3 conventions, system controls and buttons sized by the OS). When /design and a platform differ, judge on the merits and say which side changes. Motion the OS provides is left to the OS.
- TypeScript (`apps/web`, `apps/server`, `apps/admin`) is checked by Ultracite: run `bun x ultracite fix`, and avoid `as` assertions other than `as const`.

## How to ship

- main takes pull requests only; name the Linear issue (team POC) in the PR, and file skipped findings or follow-ups there.
- Before merging: run `/code-review` and address it, CI must be green (Xcode Cloud included for iOS), and review threads resolved. Merge main into the branch first when other PRs landed. Never merge on red.
- Deploys happen through Cloudflare Workers Builds on merge; never deploy by hand.
