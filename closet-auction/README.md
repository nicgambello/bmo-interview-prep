# Closet Auction

Invite friends into a private group, photograph clothing from your closet, and let everyone bid for the time window you choose. Top bid when the timer runs out wins the item.

Built with **Expo (React Native)** + **Supabase** (Postgres, Auth, Storage, Realtime).

> **Shipping to the App Store?** Follow [`SHIPPING.md`](./SHIPPING.md) — it's the actual checklist with timing.
>
> **Need a privacy policy?** Start from [`PRIVACY.md`](./PRIVACY.md) — required before App Review.

## What's in the box

- Email/password auth with auto-created profiles
- Create or join groups by 6-character invite code
- Upload a photo (camera or library), title, description, starting bid, and auction length (15m / 1h / 6h / 1d / 3d)
- Live item grid per group with countdowns
- Bidding screen with realtime updates, bid history, quick-bid buttons, haptic feedback
- Server-side validation: minimum bid, deadline enforcement, seller-can't-bid, member-only — all in a single SQL `place_bid` RPC
- Auction settlement: `settle_due_auctions` RPC marks expired auctions and records the winner
- **Push notifications**: "you've been outbid", "new bid on your listing", "you won" — fired from a Postgres trigger via `pg_net` to the Expo Push API
- **Profile screen** with display-name editing, blocked-user list, sign out, **delete account** (full cascade)
- **Moderation**: report items, block sellers (Apple Guideline 1.2 compliant)
- **Cancel auction** by the seller before bids end

## One-time backend setup (Supabase, ~10 min)

1. Create a free project at <https://supabase.com>.
2. In **SQL Editor**, paste the contents of `supabase/migrations/0001_initial.sql` and run it.
3. In **Authentication → Providers**, enable Email. While testing, you may want to disable "Confirm email" so accounts work instantly.
4. In **Settings → API**, copy the **Project URL** and the **anon public** key.
5. (Recommended) In **Database → Cron Jobs**, schedule `select public.settle_due_auctions();` every minute, so auctions settle even when nobody opens the app:

   ```sql
   select cron.schedule('settle-auctions', '* * * * *', $$select public.settle_due_auctions();$$);
   ```

## Run locally

```bash
cd closet-auction
cp .env.example .env             # paste your Supabase URL + anon key
npm install
npx expo start                    # then scan the QR with Expo Go on iPhone/Android
```

Two phones / two simulators with two accounts in the same group will let you watch live bidding in realtime.

## Path to the App Store

Expo handles iOS builds for you in the cloud (no Mac needed) via **EAS Build**.

### 1. Create an Expo account and link the project

```bash
npm install -g eas-cli
eas login
eas init                                  # creates the project; copy the projectId into app.json → expo.extra.eas.projectId
```

### 2. Apple Developer Program

You need an Apple Developer membership ($99/yr) at <https://developer.apple.com/programs/>. EAS will create the certificates and provisioning profiles for you when you run the build.

### 3. Production build

```bash
eas build --platform ios --profile production
```

EAS will prompt for Apple credentials, generate certificates, and produce an `.ipa`.

### 4. Create the app in App Store Connect

At <https://appstoreconnect.apple.com>: **My Apps → +** with bundle id `com.closetauction.app` (matches `app.json`). Set name, primary language, SKU.

Fill in `eas.json` → `submit.production.ios` with your Apple ID, App Store Connect app ID (`ascAppId`), and team ID.

### 5. Submit

```bash
eas submit --platform ios --profile production
```

This uploads the build to App Store Connect. From there you can release to **TestFlight** for internal testing or submit for **App Store review**.

### 6. App Review notes

You'll need:

- App icon (1024×1024) and at least one screenshot per required device size — drop them into `assets/` and reference from `app.json`.
- A short privacy policy URL describing what data you collect (email + photos + bids stored in Supabase). A static GitHub Pages page is fine.
- A demo account login Apple's reviewers can use (just create one on a fresh signup).

For Android / Play Store, the equivalent flow is `eas build --platform android --profile production` then `eas submit --platform android` (one-time $25 Play Console fee).

## What's intentionally out of scope (next steps)

- Payments — winners coordinate handoff/payment offline. Stripe Connect would be the natural next step but adds significant App Review complexity (Apple requires IAP for digital goods, but physical-goods marketplaces can use third-party payments).
- Push notifications when you're outbid — `expo-notifications` + a Postgres trigger that calls Expo's push API would be ~50 lines.
- Group chat — could layer on top of an extra `messages` table with the same group RLS policy.
- Profile editing, item editing, cancel-auction — straightforward followups.

## Project layout

```
closet-auction/
├── app/                              # expo-router file-based routes
│   ├── _layout.tsx                   # root: auth provider + stack
│   ├── index.tsx                     # auth-aware redirect
│   ├── (auth)/                       # sign-in / sign-up
│   └── (app)/                        # authenticated routes
│       └── groups/
│           ├── index.tsx             # your groups
│           ├── new.tsx               # create group
│           ├── join.tsx              # join by invite code
│           └── [groupId]/
│               ├── index.tsx         # items grid + share invite
│               ├── new-item.tsx      # photo upload + auction setup
│               └── item/[itemId].tsx # bidding screen (realtime)
├── src/
│   ├── lib/                          # supabase client, auth context, storage, time, theme
│   ├── components/                   # Countdown, SignedImage
│   └── types/database.ts             # hand-maintained schema mirror
├── supabase/migrations/0001_initial.sql
├── app.json   eas.json   .env.example
```
