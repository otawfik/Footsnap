# Putting FootSnap on the App Store — a beginner's guide

You don't need a Mac with Xcode, and you don't need to know iOS development. You'll type a handful of commands
and click through a few websites. Plan for **one afternoon of setup**, then **1–3 days waiting** for Apple to review
the app.

**Can't I just Google "App Store developer account"?** You can, and that covers step 1 (signing up). The account on
its own doesn't put an app in the store, though. After that you build the app file, upload it, and fill in the store
listing. This guide walks through all of it.

---

## What it costs

| What | Price | Needed for |
| --- | --- | --- |
| Apple Developer Program | **$99 per year** | The App Store. There's no way around this one. |
| Expo account | Free | Builds the iPhone app file in the cloud, so you don't need a Mac |
| Google Play Console | **$25 once** | Optional: only if you also want Android |

Nothing else costs money. The football data and the website are on free plans.

---

## Step 1 — Join the Apple Developer Program (about 30 minutes, then up to 48 hours' wait)

1. On a computer, go to **developer.apple.com/programs/enroll**.
2. Click **Start your enrollment** and sign in with your Apple ID (the one you use on your iPhone). Apple will ask
   you to turn on two-factor authentication if it isn't on already.
3. When it asks how you're enrolling, choose **Individual / Sole Proprietor**. Your real name is shown as the
   seller in the App Store. (Choosing "Organization" needs a registered company and a D-U-N-S number, so skip that.)
4. Fill in your legal name and address exactly as they appear on your ID.
5. Pay the $99.
6. Wait for the "Welcome to the Apple Developer Program" email. Usually it's within a few hours; sometimes up to 2
   days. **You can't do steps 4–8 until it arrives.** Steps 2 and 3 can happen while you wait.

## Step 2 — Make a free Expo account (5 minutes)

1. Go to **expo.dev** and click **Sign up**. Any email works.
2. Remember the username and password, because you'll use them in step 3.

## Step 3 — Set up the tools on your computer (15 minutes)

Open **Terminal** (on a Mac, press ⌘ + Space and type "Terminal"). Type each line and press Enter after it.

```bash
# get the app's code
git clone https://github.com/otawfik/Footsnap
cd Footsnap
npm install

# install Expo's build tool and sign in with the account from step 2
npm install -g eas-cli
eas login

# connect this project to your Expo account (answer "Yes" to the questions)
eas init
```

`eas init` adds a line to `app.json`. Save that change to GitHub with:

```bash
git add app.json && git commit -m "Link Expo project" && git push
```

## Step 4 — Build the iPhone app (5 minutes of your time, about 20 minutes of waiting)

In the same Terminal window:

```bash
eas build --platform ios --profile production
```

It asks a few questions. Here's what to answer:

- **"Do you want to log in to your Apple account?"** Yes. Use the Apple ID from step 1.
- **"Generate a new Apple Distribution Certificate?"** Yes.
- **"Generate a new Apple Provisioning Profile?"** Yes.
- Anything about "push notifications": **No** (FootSnap doesn't use them).

Expo builds the app on its own computers. When it finishes, the Terminal shows a link. You don't need to download
anything; step 6 sends the build to Apple for you.

## Step 5 — Create the app's page in App Store Connect (10 minutes)

1. Go to **appstoreconnect.apple.com** and sign in with the same Apple ID.
2. Click **Apps**, then the blue **+** button, then **New App**.
3. Fill in:
   - **Platforms:** iOS
   - **Name:** FootSnap. If Apple says the name is taken, try "FootSnap: Football Cards" or "FootSnap Live".
   - **Primary language:** English (U.S.) or English (U.K.)
   - **Bundle ID:** choose **com.otawfik.footsnap** from the list (step 4 created it)
   - **SKU:** footsnap-001 (a private reference code; anything works)
   - **User Access:** Full Access
4. Click **Create**.

## Step 6 — Send the build to Apple (2 minutes, then about 15 minutes of processing)

Back in Terminal:

```bash
eas submit --platform ios --latest
```

Sign in with your Apple ID again if asked. When it finishes, the build shows up in App Store Connect under
**TestFlight** after about 15 minutes of processing.

## Step 7 — Try it on your own iPhone first (optional, recommended)

1. Install the **TestFlight** app from the App Store on your iPhone.
2. In App Store Connect, open FootSnap → **TestFlight** → **Internal Testing** → **+** and add yourself.
3. Open TestFlight on your iPhone and install FootSnap. Try every tab, open a pack, play "Who's this?", play a Duel, tilt a card.

## Step 8 — Fill in the store listing (about 45 minutes)

In App Store Connect, open FootSnap. Everything below is copy and paste.

### App Store tab → iOS App 1.0

**Screenshots:** drag in the eight images from `docs/screenshots/ios-6.9/`, in order in the code folder. They're the exact
size Apple asks for (6.9-inch iPhone).

**Promotional text:**
```
Live scores, collectible player cards with real stats, and a model that predicts every match. Free, no account.
```

**Description:**
```
FootSnap is football as a card game, built on real data from Europe's top five leagues and the Champions League.

COLLECT EVERY PLAYER
Every player is a card. Rarity comes from real goal contributions, and every card's ability is a true stat or fact:
"Leads the Premier League with 8 goals", "The only player from Japan in the league". Open a free pack every day,
upgrade cards through seven tiers to Legend, and name mystery players in "Who's this?" to unlock Premium cards.

DUEL
Build a 12-card deck from your collection and battle the AI manager across three zones of the pitch. Every card's
cost and power come from the player's real season. Press to double the stakes when you think you're winning.

THE SEASON, YOUR WAY
Replay the table matchday by matchday with the time machine. See everyone's title and relegation odds from
thousands of simulated seasons, then set the scores of upcoming games yourself and watch the odds move.

EVERY MATCH, OPENED UP
Live scores, results and fixtures, with the chance of every scoreline and how both teams' seasons have gone.

PICKS
Call the results, Press one pick a matchday to double the stakes, and try to beat the model.

No account. No ads. No tracking. Nothing to buy.

Data from football-data.org. FootSnap is independent and not affiliated with any league or club.
```

**Keywords:**
```
football,soccer,cards,live scores,premier league,la liga,champions league,predictions,collect,table
```

**Support URL:** `https://footsnap-app.vercel.app/support`
**Marketing URL:** leave blank

**Build:** click **+** and choose the build from step 6.

**App Review Information:** untick "Sign-in required". In **Notes**, paste:
```
FootSnap needs no login. Content loads on launch. Live scores appear only while matches are being played; outside
match times the Matchday tab shows upcoming fixtures and results. Card packs are free (one per day per league) and
the odds are shown in the Cards tab. There are no purchases, real-money features, betting, or links to bookmakers.
Predictions are statistical estimates shown for fun.
```
Add your name, email and phone number. Apple only uses them if they have a question.

### App Information (left sidebar)

- **Category:** Sports (secondary: Games → Card, if you like)
- **Content Rights:** "Yes, it contains third-party content". Apple then asks whether you have the rights to it.
  Answer honestly. The match data is used under football-data.org's terms. **The App Store build already leaves
  out the two things you don't clearly have rights to:** club crests (the clubs' trademarks) and player photos
  (the Wikipedia photos allow reuse with credit, but a photo of a real person used on a collectible card can raise
  "right of publicity" questions in some countries). Both are switched off in `eas.json` (`EXPO_PUBLIC_SHOW_CRESTS`
  and `EXPO_PUBLIC_SHOW_PHOTOS` set to `"false"`). The store version shows badges and shirts in each club's colours
  instead. With those off, you can say Yes to having the rights to everything left. The website version keeps both.
- **Age Rating:** click **Edit** and answer every question **None / No**. FootSnap has no violence, no real
  gambling, no user chat and no web browser. Packs are free, so nothing involves money.

### Pricing and Availability

- **Price:** Free
- **Availability:** all countries, or choose some

### App Privacy

1. **Privacy Policy URL:** `https://footsnap-app.vercel.app/privacy`
2. Click **Get Started** under Data Collection and choose **"No, we do not collect data from this app."** That's
   accurate: no accounts, analytics, ads or tracking, and your cards and picks stay on the phone.

## Step 9 — Submit (1 minute, then 1–3 days)

Click **Add for Review**, then **Submit to App Review**. Apple emails you when it's approved, usually within 1–3
days. Once it's approved, the app goes live on the App Store automatically, unless you choose to release it by hand.

---

## If Apple rejects it

Rejections are common and usually easy to fix. Apple tells you exactly which rule it's about. Reply in App Store
Connect, change what they asked, then run steps 4 and 6 again and resubmit.

### Things that can get it rejected

- **Guideline 5.2: other people's trademarks.** Club crests belong to the clubs. If you submitted with crests on and
  a reviewer asks you to prove you're allowed to use them, set `"EXPO_PUBLIC_SHOW_CRESTS": "false"` in `eas.json`,
  rebuild (steps 4 and 6) and resubmit. League and club *names* used to describe real matches are normally fine.
- **Simulated gambling.** Picks and packs are free and use no money. Keep it that way: don't add betting odds in
  "5/2" style, bookmaker links, or paid packs. Paid random packs would also legally require showing the odds
  (they're already shown).
- **football-data.org's free plan is for non-commercial use.** Keep the app free with no ads, or upgrade their plan
  first.

## Updating the app later

Each time you want to release a new version:

1. In `app.json`, change `"version": "1.0.0"` to `"1.0.1"` (or `1.1.0` for bigger changes).
2. Run `eas build --platform ios --profile production`, then `eas submit --platform ios --latest`.
3. In App Store Connect, click **+ Version**, type the same number, attach the new build, write "What's new", and
   submit.

## Android (optional, $25)

1. Sign up at **play.google.com/console** and pay the one-time $25.
2. Run `eas build --platform android --profile production`.
3. In Play Console, **Create app**, then fill in the same listing text, screenshots and privacy answers ("No data
   collected").
4. Run `eas submit --platform android --latest`. The first time, Play Console walks you through creating a "service
   account key" so EAS can upload for you. Expo's docs have a page for it: search "EAS submit Android".
