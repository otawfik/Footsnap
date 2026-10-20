# Releasing FootSnap to the App Store and Google Play

Everything in the repo is ready for a store build. What's left needs your accounts, and two of them cost money.

## What you need

| | cost | used for |
| --- | --- | --- |
| football-data.org key | free | live data (set as `FOOTBALL_DATA_KEY` on the Vercel project) |
| Expo account | free | EAS Build compiles the iOS/Android binaries in the cloud (free tier: limited builds per month) |
| Apple Developer Program | **$99 / year** | signing and publishing on the App Store |
| Google Play Console | **$25 once** | publishing on Google Play |

No Mac or Xcode is needed: EAS builds iOS in the cloud.

## Already done in the repo

- Bundle ID / package `com.otawfik.footsnap`, version 1.0.0, build numbers managed by EAS (`eas.json`,
  `appVersionSource: remote`, `autoIncrement` on production).
- App icon 1024×1024 with no alpha channel (App Store Connect rejects one with alpha), Android adaptive icon,
  splash screen, web favicon.
- `ITSAppUsesNonExemptEncryption: false`: the app uses only standard HTTPS, so there's no export-compliance
  question on each upload.
- iPhone only (`supportsTablet: false`), so no iPad screenshots are required.
- Android permissions trimmed to what the app uses.
- In-app About screen with links to the privacy policy and support pages (Guideline 5.1.1 requires the policy to be
  reachable inside the app):
  - Privacy policy: https://footsnap-app.vercel.app/privacy
  - Support: https://footsnap-app.vercel.app/support
- Player photos credited and linked to their Wikipedia source. No EA / FIFA trademarks anywhere in the app.
- CI compiles the iOS, Android and web bundles and runs `expo-doctor` on every push.

## Build and submit

```bash
npm install -g eas-cli
eas login                      # your Expo account
eas init                       # links the project, adds extra.eas.projectId to app.json

# iOS
eas build --platform ios --profile production      # EAS asks for your Apple ID and creates certificates
eas submit --platform ios --latest                 # uploads to App Store Connect

# Android
eas build --platform android --profile production  # .aab for Play
eas submit --platform android --latest             # needs a Play service-account key the first time
```

To try a build on a phone before submitting: `eas build --platform android --profile preview` gives an installable
APK; for iOS, TestFlight receives every `eas submit` upload.

## App Store Connect listing

**Name:** FootSnap
**Subtitle (30):** Live scores, tables & odds
**Category:** Sports · **Age rating:** 4+ (no objectionable content; answer "None" throughout)
**Price:** Free

**Promotional text (170):**
Live scores for the Premier League, La Liga, Bundesliga, Serie A, Ligue 1 and the Champions League, with model-based
odds for every upcoming match.

**Description:**
```
FootSnap keeps up with Europe's top five leagues and the Champions League.

LIVE AND LATEST
Live scores that refresh while a match is on, the latest results, and the next fixtures, all in one place.

PREDICTIONS THAT SHOW THEIR WORK
Every upcoming match gets home, draw and away odds, expected goals and the most likely score from a goals model
fitted to this season's results. FootSnap also shows how often that model has called results correctly this
season, tested fairly on matches it hadn't seen.

TABLES
Full standings with Champions League places, relegation and play-off spots, and each team's recent form.

PLAYERS AND SQUADS
The top scorers in every league with player cards, plus every club's coach, squad, ages and positions, with search.

No account. No ads. No tracking.

Data from football-data.org. FootSnap is independent and not affiliated with any league or club.
```

**Keywords (100):** `football,soccer,live scores,premier league,la liga,bundesliga,serie a,ligue 1,champions league,predictions`

**Support URL:** https://footsnap-app.vercel.app/support
**Privacy policy URL:** https://footsnap-app.vercel.app/privacy

## App Privacy ("nutrition label")

Answer **"No, we do not collect data from this app."** The app has no accounts, analytics, ads or tracking. Server
request logs kept by the host for delivery and security aren't "collection" under Apple's definitions, since they
aren't linked to a user or used beyond operating the service.

## Screenshots

Ready to upload: [`docs/screenshots/ios-6.9/`](screenshots/ios-6.9/) has six 1320 × 2868 PNGs (the 6.9" iPhone size
App Store Connect requires; it scales them down for smaller iPhones), captured from the live app with real data:
live Champions League scores, Predictions, a player card, the table, Squads and results. Retake them whenever the
UI changes.

## Notes for App Review

```
FootSnap needs no login. All content loads on launch. Live scores appear only while matches are in progress;
outside match times, Home shows the latest results and upcoming fixtures. Predictions are statistical estimates
shown for information only; the app has no betting, wagering or links to bookmakers.
```

## Review risks to know about

- **Guideline 5.2 (intellectual property).** Club crests and competition names belong to their owners. Many score
  apps show them through licensed data feeds, and football-data.org supplies the crest images, but App Review can
  ask for proof of rights. If that happens, the fallback is to hide crests (the UI already handles a missing crest)
  and reply that names are used descriptively.
- **football-data.org's free tier** is meant for non-commercial use. Keep the app free and ad-free, or move to a
  paid plan first.
- **Predictions and gambling.** The listing and review notes say plainly that there's no betting. Don't add bookmaker
  links or odds formats like "5/2", or the app may need a gambling age rating and licences.
