# Shipping checklist — Closet Auction → App Store

Things you must do that I cannot do for you. Tackle in order.

## 1. Backend (one time, ~15 min)

- [ ] Create a project at <https://supabase.com> (free tier is fine).
- [ ] In **SQL Editor**, run `supabase/migrations/0001_initial.sql`.
- [ ] In **SQL Editor**, run `supabase/migrations/0002_moderation_and_push.sql`.
- [ ] **Authentication → Providers**: ensure Email is on. For testing, you can disable "Confirm email" so accounts work instantly. Re-enable before launch.
- [ ] **Database → Cron Jobs**: schedule auction settlement so winners get notified even when nobody opens the app:
  ```sql
  select cron.schedule('settle-auctions', '* * * * *', $$select public.settle_due_auctions();$$);
  ```
- [ ] **Settings → API**: copy `Project URL` + `anon public` key.

## 2. Local config

- [ ] `cp .env.example .env` and paste the URL + anon key.
- [ ] `npm install` (already done if you've been running it).
- [ ] `npx expo start`, scan with Expo Go on your phone, sign up, create a group, list an item.
- [ ] Test bidding from a second device with a second account.

## 3. Apple Developer + EAS

- [ ] Enroll in the Apple Developer Program at <https://developer.apple.com/programs/> ($99/yr). Allow 24-48h for activation if you're a new developer.
- [ ] `npm install -g eas-cli && eas login`.
- [ ] `eas init` — copy the printed `projectId` into `app.json` → `expo.extra.eas.projectId`.
- [ ] `eas credentials` — confirm iOS credentials. EAS will create them automatically on the first build if you let it.

## 4. App Store Connect

- [ ] Create the app at <https://appstoreconnect.apple.com/apps>:
    - Bundle ID: `com.closetauction.app` (must match `app.json`)
    - SKU: anything unique (`closet-auction-001` is fine)
    - Primary language: English (U.S.)
- [ ] Fill in `eas.json` → `submit.production.ios`:
    - `appleId`: your Apple Developer email
    - `ascAppId`: the App Store Connect numeric app ID (visible in the app's URL)
    - `appleTeamId`: your Apple Developer Team ID
- [ ] Privacy policy URL: host `PRIVACY.md` somewhere public (GitHub Pages is free) and paste the URL.

## 5. App Review compliance — done by the codebase, but verify

- [x] Account creation requires email (Apple 5.1.1)
- [x] **Account deletion** in-app at Profile → Delete account (Apple 5.1.1(v))
- [x] **User-generated content controls** (Apple 1.2): in-app **report** any item, **block** any seller, **24-hour review** commitment in privacy policy
- [x] Photo permission strings in `app.json` `infoPlist`
- [x] Camera permission strings in `app.json` `infoPlist`
- [x] No third-party advertising SDKs
- [x] No payment of digital goods (physical clothing only — third-party payment is allowed off-app under Apple 3.1.5(a) for physical goods marketplaces)

## 6. Marketing assets you still need (not in repo)

- [ ] **App icon**: replace `assets/icon.png` with a real branded version. The placeholder in repo is a gradient "CA" — fine for TestFlight, not for launch.
- [ ] **Screenshots** (required by App Store): one set per device class. Easiest path:
    - Take 3-5 screenshots in the iOS simulator at the required sizes (6.7", 6.5", 5.5").
    - Or use a service like <https://screenshots.pro> or Figma templates.
- [ ] **App preview video** (optional, recommended).
- [ ] **App description** (max 4000 chars): what the app does, who it's for.
- [ ] **Keywords** (max 100 chars): `closet,auction,fashion,thrift,wardrobe,bid,resale,style`.
- [ ] **Support URL**: a page where users can contact you (a Notion page or simple Carrd works).

## 7. Build & submit

```bash
cd closet-auction

# First production build
eas build --platform ios --profile production

# Once the build finishes (10-30 min), submit to App Store Connect
eas submit --platform ios --profile production --latest
```

## 8. Test on TestFlight, then submit for review

- [ ] In App Store Connect → TestFlight, add yourself as an internal tester.
- [ ] Verify on a real device: sign-up, push permission prompt, create group, list item, bid from a second account, get a "you've been outbid" push, win an auction, get a "you won" push.
- [ ] Try **Profile → Delete account** — data should be gone in <30s (test with a throwaway account).
- [ ] Submit for App Store review with a **demo account** Apple's reviewer can use (just create one fresh and put the credentials in the App Review notes).

## 9. After approval

- [ ] Reply to any reviewer messages within 24h.
- [ ] When approved, choose either manual release or auto-release.
- [ ] Tell your friends. The first group is the lonely group.

---

### Realistic timeline

- Backend setup + local testing: **~30 min**
- Apple Developer enrollment activation: **24-48h** (start this *now*)
- First EAS build: **~30 min**
- App Store review: **1-3 days** (longer for first submission, sometimes faster)

Total wall-clock from a working repo to live on the App Store: **~3-7 days**, most of it waiting on Apple.
