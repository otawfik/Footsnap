# FootSnap

[![ci](https://github.com/otawfik/Footsnap/actions/workflows/ci.yml/badge.svg)](https://github.com/otawfik/Footsnap/actions/workflows/ci.yml)

**A collectible card game for real football, driven by live data and a statistical model.** Every player in Europe's
top five leagues and the Champions League (about 3,000 of them) is a card whose rarity, Power and abilities are
computed from this season's real numbers. You collect them from free daily packs, upgrade them, and play them in a
Marvel Snap-style duel. Every fixture gets a win / draw / loss forecast from a Poisson goals model, and the rest of
the season is simulated 3,000 times so you can ask "what if?". One TypeScript codebase ships to iOS, Android and the web.

**Open it:** [footsnap-app.vercel.app](https://footsnap-app.vercel.app) · run it in Expo Go (below) ·
store release guide: [`docs/app-store.md`](docs/app-store.md)

### At a glance

| | |
|---|---|
| **Platforms** | iOS, Android and web from one Expo / React Native codebase (TypeScript, strict) |
| **Data** | Live fixtures, tables, scorers and squads for 6 competitions, through a serverless edge-cached proxy |
| **Model** | Poisson goals model (Maher 1982, the base of Dixon & Coles 1997) fitted by maximum likelihood, plus a Monte Carlo season simulator with parameter uncertainty and common random numbers |
| **Game** | ~3,000 auto-generated cards, a daily-pack economy, 7 upgrade tiers, and a turn-based duel engine with an AI opponent |
| **Computer vision** | An automated art pipeline: Wikipedia / Wikidata photo matching verified by date of birth, background removal (U²-Net), face alignment (YuNet), face verification (SFace) and quality gates, giving 1,335 licence-credited player cut-outs |
| **Quality** | 144 unit tests (Vitest); CI runs typecheck, tests, `expo-doctor`, a native-compat check and a full web build on every push |
| **Cost to run** | $0: free data tier, free hosting; the API key never leaves the server |

### Engineering highlights

- **A forecast that shows its work.** Team attack and defence strengths are fitted by iterative scaling to the
  maximum-likelihood solution, starting from last season's strengths so a few early results can't swing the ratings
  (backtested on 2,105 matches). Each match
  page shows the full scoreline probability grid the forecast comes from.
- **"What if?" that only moves what it should.** The season simulator pins any results you set and re-runs the
  rest. Common random numbers mean only the clubs your result actually affects change, not noise from re-rolling.
- **A shared rate limit, spent once.** The free data tier allows 10 requests a minute. A Vercel edge function holds
  the key, allowlists four upstream paths, and caches each resource for an appropriate time (30 s to 12 h), so one
  upstream call serves every user. When the tier is busy, the edge keeps serving the last good copy, and the app
  falls back to a saved copy when offline.
- **Cards that are always true.** Every ability is a fact computed from the data ("Leads the Premier League with
  9 goals", "The only player from Japan in the Premier League"), never invented.
- **Art at scale, legally.** Only freely licensed Wikimedia Commons photos are used, matched to the right player by
  date of birth and credited on every card. Every face is detected, levelled and framed identically, and blurry or
  badly cropped photos are rejected automatically. The App Store build ships with photos and crests switched off
  (a build flag), for image rights.

### FootSnap 2.0

A calm dark interface with a sports-broadcast feel. Colour comes from football itself: every fixture opens with a
TV-style score bug in the two clubs' kits, match pages split diagonally between the two kits, club pages are headed
in the club's colours, and picks fill in your team's colour. Forecasts read as market-style probability rows with
one-tap free picks (points only, nothing to buy or bet), and the cards are collectibles with metal rarity rims, real
stat lines and tilt-reactive foil. Design spec: [`docs/redesign/SPEC.md`](docs/redesign/SPEC.md).

<p>
  <img src="docs/screenshots/v2/1-home.jpg" width="200" alt="Home: Arsenal v Hull City as a TV-style score bug in both kits, with home / draw / away chances to pick from">
  <img src="docs/screenshots/v2/2-card.jpg" width="200" alt="Erling Haaland's Icon card in Man City sky blue with a holo rim: Power 12, nation, club and his real season stats">
  <img src="docs/screenshots/v2/3-collection.jpg" width="200" alt="The collection grid: Gold and Silver cards in their clubs' colours; players without a photo get a club-colour monogram">
</p>
<p>
  <img src="docs/screenshots/v2/4-pack.jpg" width="200" alt="Pack opening: a new Bronze card revealed, with its true-of-the-data ability">
  <img src="docs/screenshots/v2/5-duel.jpg" width="200" alt="The duel board: three real stadiums (Selhurst Park, Hull's Kingston Communications Stadium, the Etihad) in their home clubs' kits, each with its home-crowd boost and twist, Power totals and the hand">
  <img src="docs/screenshots/v2/6-match.jpg" width="200" alt="A match page split between the two kits: the model's chances, expected goals, your pick and the likeliest scores">
</p>

## What's in it

**Cards.** Every player has a card. Rarity is their rank by goals × 2 + assists: the top 3 in each competition are
Icon, 4–10 Gold, 11–20 Silver, everyone else Bronze. Each rarity has its own metal rim (copper, chrome, gold, and an
iridescent holo for Icon). The big number is Power (goals × 2 + assists) or age. Abilities are always true statements
computed from the data, such as "Leads the Premier League with 8 goals", "3 of 8 goals from the penalty spot", or
"The only player from Japan in the Premier League". The face is lit in the colours that club actually wears, from a
kit table for every club in the six competitions, with text that darkens automatically until it clears 4.5:1. The
art is the player's own photo, cut out of its background and framed identically on every card (same head size, eyes
on the same line); players without a free photo get an engraved monogram in club colours. Cards tilt with the
phone's gyroscope, carry foil on Gold and Icon, and flip to show full stats and exactly how each number was worked out.

**A collection system modelled on Marvel Snap's.** A free daily pack per league (odds shown, nothing to buy), credits
from packs, duplicates and correct picks, and boosters per card from duplicates. Spend them to upgrade a card
through seven tiers, each with a visible effect: Breakout (the player breaks out of the frame), Depth (3D parallax),
Pulse (animated glow), Crest, Holo, and Legend, a black-and-gold frame with a random Gilded, Prismatic, Crackle or
Starfield finish. A Collection Level with milestone rewards ties it together.

**Who's this?** A mystery card shows its cost, Power, rarity, position, age and club colours, with the player's
silhouette and the name hidden. Name the player from four options to unlock their **Premium** variant: the
player with a white sticker outline, a deeper club-colour backdrop and a gold name. Five a day.

**Duel, a card game with the cards you've collected.** Twelve-card decks, six turns, three real stadiums from the
league (football-data's own venue names). A club's players get +4 Power from the home crowd at their ground, and
each ground has a twist that shows as the match goes on (Cauldron, Heavy pitch, Wall of sound, Tactics board...).
Both sides play face down and reveal together. Win two stadiums to win. Every card's cost, Power and ability come
from the player's real data: a signature for the 30 biggest stars, a role from the season (top scorer, penalty
taker, playmaker...), age or passport, or a mechanic for his position, each with the fact it's built from. Press to
double the prize when you think you're winning, or retreat. Decks are built from your collection on a curve, topped
up with loan players. The AI manager plays the same rules with a deck of the same costs; `scripts/duel-sim.ts`
plays it against itself on the five leagues to keep the balance honest.

**The table, three ways.** The official standings; a **time machine** that replays the season matchday by matchday,
with rows gliding to their new places; and **odds** from 3,000 simulated seasons. The **what-if machine** lets you
set the score of upcoming games and re-simulates the rest of the season. Thanks to common random numbers, only the
clubs your result really affects move.

**Matches and clubs.** Live scoreboards with rolling digits and a goal flash; every fixture with home / draw / away
odds; match pages with a tappable scoreline heatmap, the points race and each side's key card; club pages with the
season's position chart, attack and defence ratings, projections and the squad as cards.

**Picks.** Call the next matchday, Press one pick to double the stakes (+4 or −2), and play against the model, whose
calls are made only from results before each match.

## The model

Goals are modelled as independent Poissons (Maher, 1982; the base of Dixon & Coles, 1997):

```
home goals ~ Poisson( mu_home · attack[home] · defence[away] )
away goals ~ Poisson( mu_away · attack[away] · defence[home] )
```

`mu_home` and `mu_away` are the season's average home and away goals, so home advantage is learned rather than
assumed. Attack and defence are fitted by iterative scaling, which converges to the maximum-likelihood fit while
accounting for who each team has played. Outcome probabilities come from summing the 11 × 11 scoreline grid.

**Starting from last season.** Each league season starts every team at its strength from last season, pulled 15%
of the way back toward average (in log space), worth 16 games of evidence; promoted clubs start where the relegated
clubs were. Both numbers were tuned by a walk-forward backtest on 2,105 matches across the five leagues (2025-26 and
2026-27, each predicted only from games before its day): against the old prior of eight league-average games, the
Brier score fell from 0.613 to 0.599 overall and from 0.628 to 0.597 in the first ten rounds. The difference shows in
the title race: nine games into 2026-27, the old prior made Brighton (+17 goal difference, 5 points off the top) a
43.7% title pick; starting from last season, Arsenal lead at 49%, Man City 23%, Brighton 21%. The Champions League
keeps the league-average prior, since its field changes every year.

The record shown in the app is honest by construction: each finished match is predicted from a fit on matches
before its day, and scored on accuracy and multi-class Brier score against two baselines. Code:
[`lib/model.ts`](lib/model.ts). The unit tests check it against simulated seasons with known strengths: the fit
recovers the strength order and home advantage, and the walk-forward test beats both baselines when teams differ
and doesn't when they're identical.

**Season simulation.** Each simulated season redraws every team's strength around its fitted value (log-normal,
wider for teams with fewer games). Treating fitted strengths as certain made the simulator absurdly confident ten
games in: one side had a 95% title chance. Remaining fixtures are drawn from the model, added to the official
table, and ranked by points, goal difference and goals scored.

## Architecture

```
app (iOS / Android / web)  ──►  /api/fd  (Vercel function)  ──►  football-data.org v4
                                 holds the API key
                                 path allowlist
                                 edge-cached per resource
```

- **The key never ships in the app.** It lives in the server's `FOOTBALL_DATA_KEY` environment variable. Earlier
  versions bundled it into the client, which on the web build meant anyone could read it.
- **One upstream request serves everyone.** The free tier allows 10 requests a minute. Each response is cached at
  Vercel's edge (fixtures 30 s, tables 2 min, scorers 15 min, squads 12 h), so that budget is shared across all
  users instead of spent per user. The app also de-duplicates in-flight requests and keeps short-lived copies, so
  switching tabs doesn't re-fetch.
- **When the free tier is busy, nothing breaks.** The edge keeps serving the last good copy (long
  stale-while-revalidate windows), and the app retries on its own once football-data.org's per-minute counter
  resets, using the reset time it reports.
- **Only four kinds of upstream path are allowed** (`competitions/{id}/matches|standings|scorers|teams` for the six
  supported competitions), with query parameters filtered, so the proxy can't be used as an open relay.

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go, or press i / a for a simulator
npm run test            # 70 unit tests: model, simulator, cards and abilities, collection, packs, picks, proxy
npm run typecheck
```

Expo Go and simulators talk to the deployed server, so no key is needed locally. To run your own server, deploy
this repo to Vercel, set `FOOTBALL_DATA_KEY` (free at
[football-data.org/client/register](https://www.football-data.org/client/register)), and point the app at it with
`EXPO_PUBLIC_API_BASE=https://your-deployment.vercel.app`.

CI typechecks, runs the tests and `expo-doctor`, and compiles the iOS, Android and web bundles on every push.
Releasing to the App Store and Google Play: see [`docs/app-store.md`](docs/app-store.md).

## Project structure

```
app/
  (tabs)/index.tsx        Matchday: live scoreboards, fixtures with odds, results
  (tabs)/table.tsx        standings, time machine, projected odds, what-if machine
  (tabs)/cards.tsx        collection: level, daily pack, Who's this?, every player's card
  (tabs)/duel.tsx         Duel lobby: your deck, record, rules
  (tabs)/picks.tsx        picks with a Press, against the model
  card/[id].tsx           one card: tilt, flip, upgrade, Premium variant
  pack.tsx                opening the daily pack
  guess.tsx               Who's this?
  arena.tsx               the Duel board
  match/[id].tsx          scoreline heatmap, points race, key cards
  club/[id].tsx           position chart, ratings, projection, fixtures, squad cards
  about.tsx               data sources, privacy, support links
api/fd.ts                 the Vercel proxy (holds the football-data.org key)
components/
  SnapCard.tsx            the card: rarity frames, foil, tilt, flip, upgrade tiers, Premium
  ui.tsx                  design-system primitives
  Match.tsx, Charts.tsx   scoreboards, fixture cards, SVG line charts
lib/                      pure logic, unit-tested
  model.ts                Poisson model, odds, scoreline grid, walk-forward backtest
  season.ts               Monte Carlo season simulator (what-if pins), table replay, trajectories
  cards.ts                rarity, Power and abilities from real data
  game.ts, decks.ts       the Duel engine and AI; deck building
  art.ts                  player cut-outs (optional per build)
  collection.ts           credits, boosters, upgrade tiers, finishes, Collection Level
  packs.ts, guess.ts      daily packs; Who's this? puzzles
  picks.ts                scoring, the model's calls, you vs the model
  colors.ts               club colours from football-data.org's text
  football.ts, proxy.ts   helpers; proxy allowlist and cache policy
services/api.ts           client: base URL, request sharing, saved copies for offline, optional crest stripping
constants/design.ts       the design system: tokens with measured contrast, Inter type (spec: docs/redesign/SPEC.md)
public/                   privacy policy and support pages; art/ holds the player cut-outs
scripts/art/              the photo pipeline (below)
```

## Data and credits

Football data from [football-data.org](https://www.football-data.org). Player photos come from Wikimedia
Commons via each player's Wikipedia / Wikidata entry, credited on every card with the photographer, the licence and
a link. They're modified (cropped, background removed), and modified photos keep their original licence. A
photo is only used when the Wikidata birth date matches the squad's, so a namesake never ends up on someone
else's card. `scripts/art/` rebuilds the set; about a third of players have one that passes the quality checks (and a look by eye), and the rest get a shirt in their
club's colours. The App Store build leaves photos and crests out (see [`docs/app-store.md`](docs/app-store.md)). FootSnap is an independent app, not affiliated with any league, club or football-data.org.

React Native · Expo SDK 54 · Expo Router · TypeScript · Vercel Functions · Vitest
