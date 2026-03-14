# SoccerIQ

A premium dark-themed React Native + Expo app for football intelligence — live fixtures, standings, top scorers with FIFA Ultimate Team-style player cards, form-based predictions, and squad intel across the top 5 European leagues and UEFA Champions League.

All data is fetched directly from [football-data.org](https://www.football-data.org) from the client — no backend required.

---

## Screenshots



| Home | Players | Predictions | Squad Intel |
|------|---------|-------------|-------------|
| ![home](assets/screenshots/home.png) | ![players](assets/screenshots/players.png) | ![predictions](assets/screenshots/predictions.png) | ![transfers](assets/screenshots/transfers.png) |

---

## Features

**Home**
- Live fixtures with score, match status (LIVE / HT / FT), and team crests
- League standings table with position, points, W/D/L, and goal difference
- Upcoming fixtures for the selected league — next 5 scheduled matches with date pill (Today / Tomorrow / weekday) and kick-off time

**Players**
- Top 20 scorers per league, sorted by composite score `(goals × 2) + (assists × 1.5)`
- Relative tier system: S (top 3) · A (4–10) · B (11–20) · C (rest) — so the best players always get S regardless of raw numbers
- Tap any player to open a FIFA Ultimate Team-style card with tier-specific gradient (gold / purple / cyan / green), glow border, stats, club crest, and player photo fetched from Wikipedia

**Predictions**
- Teams ranked by recent form using last 5 match results (W=3, D=1, L=0) ÷ 15
- Form confidence bar, Hot / Warm / Cold label, W/D/L season record
- Falls back to season-wide points-per-game when form string is unavailable

**Squad Intel**
- Full squad rosters for each club in the selected league
- Expandable team cards with player name, position, and nationality
- Note: football-data.org free tier has no dedicated transfers endpoint; this tab uses squad data as intel

---

## Covered Leagues

| League | ID | Country |
|--------|----|---------|
| Premier League | 2021 | England |
| La Liga | 2014 | Spain |
| Bundesliga | 2002 | Germany |
| Serie A | 2019 | Italy |
| Ligue 1 | 2015 | France |
| UEFA Champions League | 2001 | Europe |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo SDK 54 |
| Routing | Expo Router v6 (file-based) |
| Language | TypeScript |
| Data | football-data.org API v4 |
| Player photos | Wikipedia REST API (`/api/rest_v1/page/summary/{name}`) |
| UI | Linear gradients, BlurView, Ionicons |
| Navigation | React Navigation bottom tabs |

---

## Setup

### 1. Get a free API key

Register at [football-data.org/client/register](https://www.football-data.org/client/register). The free tier covers all 6 supported competitions.

### 2. Add your key to `.env`

Create a `.env` file in the project root:

```
EXPO_PUBLIC_FOOTBALL_API_KEY=your_key_here
```

This is already in `.gitignore` — it will not be committed.

### 3. Install dependencies

```bash
npm install
```

If you hit peer dependency conflicts:

```bash
npm install --legacy-peer-deps
```

### 4. Start the app

```bash
npx expo start --tunnel
```

Scan the QR code with [Expo Go](https://expo.dev/go) on iOS or Android, or press `i` / `a` to open in a simulator.

---

## Project Structure

```
SoccerIQ/
├── app/
│   ├── _layout.tsx           # Root layout (StatusBar, Stack)
│   └── (tabs)/
│       ├── _layout.tsx       # Bottom tab navigator (BlurView on iOS)
│       ├── index.tsx         # Home — live fixtures, standings, upcoming
│       ├── players.tsx       # Top scorers + FUT card modal
│       ├── transfers.tsx     # Squad intel
│       └── predictions.tsx   # Form-based predictions
├── components/
│   ├── Card.tsx              # Base card with optional gradient
│   ├── LeagueSelector.tsx    # Horizontal pill league switcher
│   ├── PlayerFUTModal.tsx    # FIFA Ultimate Team card modal
│   ├── ScreenHeader.tsx      # Page title + subtitle
│   ├── StatusBadge.tsx       # LIVE / FT / Hot / Cold badge
│   ├── EmptyState.tsx        # Placeholder with icon
│   └── LoadingSpinner.tsx    # Centered spinner
├── constants/
│   ├── theme.ts              # Colors, Typography, Spacing, Radius tokens
│   └── leagues.ts            # League definitions (ID, flag, accent color)
├── hooks/
│   └── useApi.ts             # Generic data-fetching hook (loading/error/refetch)
├── services/
│   └── api.ts                # All fetch calls → football-data.org directly
└── .env                      # EXPO_PUBLIC_FOOTBALL_API_KEY (never committed)
```

---

## Design Tokens

| Token | Value |
|-------|-------|
| Background | `#0D0D0D` |
| Card | `#161616` |
| Accent Green | `#00FF87` |
| Accent Blue | `#00C2FF` |
| Accent Purple | `#7B61FF` |

Inspired by Kalshi and Marvel Snap — near-black base, electric accent glows, card layout with sharp typography and linear gradients.

---

## Notes

- The API key is bundled client-side via `EXPO_PUBLIC_*` — acceptable for personal / dev builds. For a public release, route calls through a server proxy to keep the key private.
- Pull-to-refresh works on all screens.
- The `server/` folder contains a legacy Flask proxy that is no longer used by the app. It can be safely deleted.
