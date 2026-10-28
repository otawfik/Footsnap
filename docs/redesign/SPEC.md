# FootSnap redesign spec

Mock: `public/mock/index.html` (serve `public/` and open `/mock/`). Tokens: `constants/design.ts`.
Where the mock and this document disagree, this document wins.

## 1. Direction

**A calm dark shell with one accent, and cards that look like the real thing.**

- **The shell works like Kalshi.** It's neutral and near-black, with no tinted surfaces. It uses one sans (Inter), big tabular numbers and hairline list rows, never boxes inside boxes. Predictions are shown as **% chance** with thin bars, and every match is a three-row "market" (home / draw / away). Picking an outcome is the interaction.
- **It's dark, not light, even though Kalshi is light-first.** There are three reasons. (1) The hero object is a metal card with foil. Metal and foil read as light on a dark ground, and on white they read as grey and yellow print. (2) Card view, packs and the duel are immersive. A light shell would flash between grounds every time you enter one. (3) Football gets watched in the evening. Kalshi's discipline (neutral greys, one accent, generous space, big numbers) carries over to dark intact.
- **There is one accent: Snap blue (`#2C64E8`).** It stands for energy, selection and the primary action, and it is the cost gem on every card. Win green and loss red are semantic only. Gold appears only on the credits coin and the cards.
- **The cards are FUT-grade collectibles.** Each has a "crest-cut" silhouette (chamfered top corners, shallow shield point) and a metal rim per rarity: Bronze, Silver, Gold or Icon (pearl platinum). There's a Legend obsidian frame for tier 6. The face is dark with a halo behind the head, and the cut-out is framed the same way on every card. FUT typography sits top-left (Power, position, nation, club). The Snap cost gem sits top-right. A real-stats row runs along the bottom.
- **Photos off is a first-class design, not a fallback.** The store build ships without photos or crests. In that mode the face shows the club's kit as a diagonal sash, with an engraved metal medallion carrying the surname's initial on top. It needs no image rights and still reads as an expensive card.
- **Predictions are free points only.** Never use money, odds, bets, stakes or a sportsbook look. The copy rules are in §10.

## 2. Tokens (`constants/design.ts`)

### Colour (all text ≥ 4.5:1, computed with WCAG relative luminance)

| token | hex | use | on `bg` #0A0A0C | on `surface` #141417 | on `raised` #1D1D21 |
|---|---|---|---|---|---|
| `bg` | `#0A0A0C` | app ground | | | |
| `surface` | `#141417` | grouped rows, sheets, tab bar | | | |
| `raised` | `#1D1D21` | chips, segmented track, pressed | | | |
| `hairline` | `#26262B` | 1 px separators (decorative) | 1.31 | 1.22 | – |
| `hairlineStrong` | `#3A3A41` | bar tracks, outlines (non-text) | 1.75 | 1.63 | 1.49 |
| `text` | `#F4F4F6` | primary | 18.01 | 16.74 | 15.29 |
| `text2` | `#A6A6AF` | secondary | 8.19 | 7.61 | 6.96 |
| `text3` | `#8A8A94` | captions (min 12 pt) | 5.79 | 5.38 | 4.92 |
| `accent` | `#2C64E8` | fills only | – | – | – |
| `onAccent` | `#FFFFFF` | text on accent | 5.13 on `accent` | | |
| `accentText` | `#6F9DFF` | accent as text/lines | 7.48 | 6.95 | 6.35 |
| `win` | `#3DD68C` | W, boosted power | 10.55 | 9.80 | 8.96 |
| `loss` | `#FF6B6B` | L, cut power, zone lost | 7.13 | 6.63 | 6.05 |
| `live` | `#FF5247` | live dot and minute | 6.17 | 5.73 | 5.24 |
| `gold` | `#E9C46A` | credits coin only | 11.84 | 11.00 | 10.06 |

Form pills: `win` on `winSoft` composited over `raised` is 7.95. `loss` on `lossSoft` composited over `raised` is 5.88. The inverse primary (bg `#0A0A0C` on `text` `#F4F4F6`, used by the selected filter chip) is 18.01.

Card text was computed against the darkest face colour it sits on (the bottom plate). Bronze ink `#EDC29C` on `#150E0A` is 11.64, name 16.72. Silver ink 13.30, name 19.92. Gold ink 13.24, name 16.90. Icon ink 14.05. The cost-gem number (white) sits on the gem's mid tone `#2C64E8`: 5.13. The metal labels at 80% alpha still clear 9:1. **Recompute if you change a colour.**

Club colours (`lib/colors.ts`) are never used for text. They appear only in kit chips, the card sash and the face's club wash.

### Type: Inter for the UI, Inter Tight for card numerals and names. Every number uses `fontVariant: ['tabular-nums']`.

| style | font | size / line | tracking | use |
|---|---|---|---|---|
| largeTitle | Inter 800 | 32/38 | −0.6 | tab titles ("Today", "Cards") |
| title | Inter 700 | 22/28 | −0.3 | section heads, card-view name |
| headline | Inter 600 | 17/22 | −0.2 | row titles |
| body | Inter 400 | 15/21 | 0 | prose, `text2` |
| callout | Inter 500 | 14/19 | 0 | buttons-in-rows, chips |
| footnote | Inter 400 | 13/18 | 0 | metadata, `text3` |
| caption | Inter 500 | 12/16 | 0 | legal, credit |
| overline | Inter 600 | 12/16 | +0.6, caps | "MODEL'S CHANCE" |
| tab | Inter 500 | 10.5/13 | +0.1 | tab bar |
| numHero | Inter 700 | 40/44 | −1.2 | match-page probabilities (the "%" at 22) |
| numLarge | Inter 700 | 28/32 | −0.6 | points, level |
| num | Inter 600 | 15/20 | 0 | % pills, table numbers |

### Spacing, radii, sizes

- **Spacing** is a 4-pt grid: 2, 4, 8, 12, 16, 20, 24, 32, 40, 56. The screen gutter is **20**. A section is a header, then rows, then 20 below. Lists are hairline rows with no card backgrounds. `surface` blocks are used only for promos (pack row, the two action tiles on Cards) and sheets.
- **Radii:** xs 6 (form pills), sm 10 (% pills, chips), md 14 (tiles, zone plates), lg 20, sheet 28, pill 999.
- **Sizes:** row 52 (compact 44), min hit 44, button 50 (small 34), kit chip 20 (hero 52), tab bar 49 plus the safe area.

### Motion (Reanimated)

- Durations: fast 120, base 200, slow 320, flip 480. The easing is `Easing.bezier(0.2, 0, 0, 1)` for entrances and `(0.4, 0, 0.2, 1)` for moves. The spring is damping 18, stiffness 220.
- **What moves:** press feedback (scale 0.97, 120), segmented selection (the thumb slides, 200), probability bars (width from 0 on first mount, 320), card tilt (max 9°), the idle sheen sweep (7 s loop, full card only), the pack sequence (§8) and duel reveals.
- **What never moves:** lists don't stagger, nothing bounces, there's no parallax on scroll, and confetti is banned.
- **Reduced motion** (`useReducedMotion()`): no tilt, no idle sheen (the sheen sits static at 30%), no flips (200 ms crossfade instead), no pack tear, no live-score digit rolls, and haptics still fire. Opacity fades ≤ 200 ms are allowed.
- **Haptics** (`tap()` in ui.tsx): select on segment or tab change, light on pick, medium on pack tear, heavy on an Icon reveal or a duel win.

## 3. Components (developer 1 builds these in `components/ui.tsx`)

APIs are fixed here so developers 2 and 3 can code against them on day one. Keep the existing names `tap`, `Button`, `Pill`, `Wallet`, `Screen` and `Header` exported, restyled, so nothing breaks mid-migration.

- **`Screen`** `{ children, refreshing?, onRefresh?, scroll? = true }`: bg ground, top safe area, 20 gutters, bottom padding for the tab bar.
- **`LargeHeader`** `{ title, eyebrow?, onEyebrowPress?, right? }`: eyebrow 13 `text3` (date, or "Premier League ⌄" as the league menu), title largeTitle, `right` aligned to the title's baseline. 10 above, 20 below.
- **`NavBar`** `{ title?, onBack?, right? }`: 44 tall, chevron-back 26, title 15/600 `text2`, centred.
- **`SectionHeader`** `{ title, action?: { label, onPress } }`: title 20/700, action 14/500 `accentText` with a 14 chevron.
- **`Row`** `{ left?, title, subtitle?, right?, onPress?, chevron? }`: 52 min height, a 1 px `hairline` divider under it (inset 0, the row sits in the gutter), pressed bg `raised`.
- **`KitChip`** `{ colors: ClubColors, size? = 20 }`: a circle split at 135° (primary top-left, secondary bottom-right), inner ring 1 px `rgba(255,255,255,.14)`, outer 1 px `rgba(0,0,0,.4)`. **It replaces crests everywhere in list rows, even when crests are on.** Crests appear only on the club page header (photos-on builds).
- **`Credits`** (alias `Wallet`) `{ credits }`: a pill 30 tall on `raised`, a 15 gold coin (radial `#FFF0B8` → `#E9C46A` → `#A9822F`) and the number 14/600, tabular.
- **`Button`** `{ label, onPress, kind?: 'primary' | 'secondary' | 'ghost', size?: 'md' | 'sm', icon?, disabled? }`: primary is `accent` with white text, radius 12, height 50 (sm: 34, pill radius). Secondary is `raised` with `text`. Ghost is text-only `accentText`. Disabled is 40% opacity.
- **`Segmented`** `{ options: string[], value: number, onChange }`: track `raised`, radius 12, 3 inset. The thumb is `accent` with white 15/600 text, 40 tall, and slides on change. Used for picks and the Fixtures/Table switch.
- **`FilterChips`** `{ options, value, onChange }`: pills 32 tall on `surface`, `text2`. The selected chip is inverted (`text` bg, `bg` text, 600).
- **`ProbabilityBar`** `{ home, draw, away, lead: 'H'|'D'|'A' }`: three flex segments, 6 tall, radius 3, gap 3. The leader is `accent` and the others `hairlineStrong`. Club colours are deliberately not used (Liverpool and Arsenal are both red).
- **`OutcomeRow`** `{ kit?: ClubColors, label, pct, picked, lead, onPress }`: the core "market row". It's a grid of kit (20) | label 16/500 with a 3-px bar under it (bar width = pct; track `raised`; fill `hairlineStrong`, `text2` when it's the model's lead, `accentText` when picked) | a pill 64×36 radius 10 on `raised` with "34%" 15/600. When picked, the pill is `accent` with white text and a 14 check. Rows are 5 above and below. The **whole row** is the hit target.
- **`MatchMarket`** `{ match, prediction, pick, onPick }`: a meta line (`text3` 13: "Premier League · Sun 1 Nov, 16:30" left, venue right), then three OutcomeRows (home, Draw with an empty ring instead of a kit chip, away). The footer says "Your pick · Arsenal" in `accentText` on the left and "+2 points if right" in `text3` on the right. With no pick it says "Tap an outcome to pick" and "Locks at kick-off". When locked or finished, rows aren't pressable and the result outcome gets a `win` check. Separated by a hairline.
- **`CompactMatchRow`** `{ match, prediction }`: two stacked team lines (kit 16 + name 15/500), the time 13 `text3`, then three 44×46 tiles (`surface`) with the % at 15/600 and a "1 / X / 2" label at 10.5. The highest tile is `raised` with `text`, the others `text2`. Used in lists and Matches.
- **`FormPills`** `{ results }`: 24×24, radius 6, 11/700. W is win on winSoft, L is loss on lossSoft, D is `text2` on `raised`. Oldest first, as `recentForm` returns them.
- **`Sheet`** `{ visible, onClose, title?, children }`: bottom sheet, `surface`, radius 28 at the top, a 36×5 grabber `hairlineStrong`, a scrim `rgba(0,0,0,.6)`. Used for the league picker, favourite-team picker and duel results.
- **`ProgressBar`** `{ value 0-1 }`: 4 tall, radius 2, track `raised`, fill `accent`.
- **Tab bar** (`app/(tabs)/_layout.tsx`): 4 tabs, a `BlurView` (dark, intensity 40) over `surface` at 92%, a hairline top, 49 tall plus the safe area. Ionicons: `home-outline`/`home`, `calendar-clear-outline`/`calendar-clear`, `albums-outline`/`albums`, `flash-outline`/`flash` (24). Active is `text`, inactive `text3`, labels 10.5/500 sentence case. No indicator bar.
- **`Skeleton`**: `raised` blocks pulsing between opacity 0.5 and 1 (static under reduced motion). **`Empty` / `Failed`**: an icon 28 `text3`, a headline and a body, plus a secondary Button "Try again".

## 4. Information architecture

There are **four tabs: Home · Matches · Cards · Play.** The profile sits behind the avatar on Home.

| was | becomes |
|---|---|
| Matchday tab | **Home** (your teams first) and **Matches** (every fixture) |
| Table tab | a segment inside **Matches**: Fixtures / Table / Projections |
| Picks tab | removed as a tab. Picking happens inline on every MatchMarket (Home, Matches, match page). The weekly score sits on Home and in Matches' header |
| Cards tab | **Cards** (collection, pack, Who's this?) |
| Duel tab | **Play** (Duel lobby, Who's this?) |
| about | a row in the **You** sheet |

- **Favourite teams** are new. They need no new data, only storage. The store is `useFavorites` in `lib/storage.ts`, key `fs.favorites.v1`, shaped `{ competitionId, teamId, name, tla, colors }[]`. You pick them from a sheet listing clubs by competition (`useTeams`, edge-cached 12 h), with a follow toggle on the club page. On first launch, Home shows a "Pick your teams" block in place of "Your teams".
- **League selection** becomes a menu, not a tab strip. The large-header eyebrow reads "Premier League ⌄" and opens a Sheet with six rows. The selection stays global (`context/league.tsx`), so Cards, Matches and Play follow it. Home ignores it and shows favourites across leagues: one `useSeason` per distinct favourite competition (≤ 6 requests, edge-cached).

## 5. Screens, top to bottom

**Home** (`app/(tabs)/index.tsx`)
1. LargeHeader: eyebrow is the date ("Wednesday 28 October"), title "Today", right is Credits plus the avatar (30, `#2A2A30`, initial) which opens the **You** sheet.
2. A "Live now" section, only when something is live. A row has a live dot, the minute and the score at numLarge.
3. **Your teams**, with an Edit action. One MatchMarket per favourite, showing its next fixture (≤ 3, soonest first). With no favourites, show the "Pick your teams" promo row.
4. The **pack row** (`surface`, radius 16): a mini pack (34×46 gold sleeve), "Daily pack is ready" headline and "Premier League · 5 cards", and an `Open` small button. When it's opened, show "Next pack in 6 h" with no button.
5. **Matchday N** (the current league) with an "All matches ›" action. A three-up score row: Your points / Model / Picked "2/10" (numLarge, `text3` labels). Then the 2–4 biggest fixtures as CompactMatchRows.
6. Nothing else. There are no news or ads.

**Matches** (`app/(tabs)/matches.tsx`, new; absorbs `table.tsx` and `picks.tsx`)
1. LargeHeader with eyebrow "Premier League ⌄", title "Matches", right is "14 pts" (your picks this matchday).
2. Segmented control: Fixtures / Table / Projections.
3. **Fixtures:** grouped by day (SectionHeader "Saturday 31 Oct"). Each fixture is a MatchMarket, collapsed to a CompactMatchRow once kicked off or finished (score in place of the %s). Press goes to the match page. The **Press** (double) toggle is per matchday at the top: "Press a pick: right +4, wrong −2".
4. **Table:** rows of position (13, `text3`, tabular, 24 wide), a 3 px zone stripe on the left edge (top/europe `accentText`, relegation `loss`), kit chip, name, then P, GD and Pts right-aligned (Pts 600). The time machine sits under the segmented control as a "Matchday 9 of 38" stepper (‹ ›); rows glide to their new places (320). The form column is optional on ≥ 400 pt wide.
5. **Projections:** rows of team, Title % / Top 4 % / Relegation %, each a number plus a 40-wide mini bar, from `simulate`. The **What-if** section below lists upcoming fixtures with a score stepper. Pinned results show an `accentText` "Pinned" chip, and movements show ▲▼ in win/loss.

**Match page** (`app/match/[id].tsx`)
1. NavBar: back, "Premier League · Matchday 9", and a ⋯ menu (share).
2. Hero, three columns: kit 52 + team 17/700 + "4th · 15 pts" | kick-off "16:30" 26/700, "Sun 1 Nov", venue | away. Live shows the score at numHero plus the minute in `live`. Finished shows the score plus "FT".
3. **MODEL'S CHANCE**: three numHero columns (left, centre and right aligned). The leader is `text`, the others `text2`. Then a ProbabilityBar. Then a hairline row: "Expected goals" with "1.09 – 1.14". For finished games: "What the model said before kick-off".
4. **YOUR PICK** with "Free · points only" on the right: Segmented (home / Draw / away), then a row "Press" with the caption "Right +4, wrong −2. One per matchday." and a switch (`accent` when on). Locked: the Segmented is disabled, plus a "Locked at kick-off" caption.
5. **LIKELIEST SCORES**: five columns with the score 15/600, a bar (34 tall, height = p / max; the top one `accent`, the others `hairlineStrong`) and the % 13. "All scores ›" expands the existing 6×6 heatmap (cells `accent` at opacity p/max, tappable).
6. **LAST FIVE**: two rows, kit + name, then FormPills.
7. Points race (`LineChart` restyled: 2 px lines in `text` and `text2`, hairline grid, no fills).
8. **Key cards**: two grid-size SnapCards side by side.
9. A fine-print footnote: "From a goals model fitted to this season's N results. Called before each game, it has been right X% of the time (Brier Y)."

**Club page** (`app/club/[id].tsx`)
- NavBar with a follow toggle on the right (a star; `accentText` when followed).
- Hero: crest 64 (photos-on builds) or KitChip 64, name title, "2nd · 21 pts · W L W W W".
- Segmented: Fixtures / Squad / Stats.
- **Fixtures** uses MatchMarkets. **Squad** is the card grid (3 columns, grid size). **Stats** keeps the position chart, attack/defence ratings and the projection, as rows.

**Cards** (`app/(tabs)/cards.tsx`)
1. LargeHeader: eyebrow is the league menu, title "Cards", right is Credits.
2. **Level**: "**Level 23** Collection" on the left and "62 of 545 cards" (`text3`) on the right. Then a ProgressBar to the next milestone, then "Next reward at 30" / "+50 credits". When a milestone is unclaimed, the right side becomes a small `Claim` button.
3. Two tiles (`surface`, radius 14, 2-up): Daily pack (mini pack, "Ready to open" / "Opens in 6 h") and Who's this? ("?" tile, "3 of 5 left").
4. FilterChips: All / Icon / Gold / Silver / Bronze, plus a trailing "Owned" toggle chip.
5. The grid: 3 columns, gap 10 horizontal and 14 vertical, card width = (screen − 40 − 20) / 3 (≈ 111 on a 393 pt screen). Uncollected cards draw `dim`. Press opens the card view. An upgrade-ready card gets an 8 pt `accentText` dot outside its top-right corner.

**Card view** (`app/card/[id].tsx`, transparentModal)
1. The stage is `bg` with a radial tint behind the card (Icon `rgba(200,210,255,.16)`, Gold `rgba(240,200,110,.14)`, Silver `rgba(220,225,235,.10)`, Bronze `rgba(222,150,96,.12)`).
2. A top bar: close × at 24, Credits on the right.
3. The full card: **268 wide** on ≤ 400 pt screens, 300 beyond. It's interactive: tilt, sheen, and tap to flip.
4. A hint: flip icon + "Drag to tilt · Tap to flip" 12 `text3`. It hides after the first flip, remembered in storage.
5. Name (title) plus "Man City · Forward · Norway · 26" (footnote).
6. Three ability rows (a 60 pt label column in overline style, then title 14/600 and text 13.5 `text2`). **DUEL** (label in `accentText`) shows the effect from `cardStats(card).effect`, or "No ability · Cost 6 · Power 12". **SEASON** shows the stat ability. **TRAIT** shows the trait.
7. An upgrade row: "Next: Breakout" plus "3 of 5 boosters · 25 credits", a ProgressBar, and an `Upgrade` button (disabled until affordable). At Legend: "Fully upgraded · Gilded finish". The Premium variant toggle is a Row with a switch when unlocked.
8. The photo credit (caption, underlined, links out). Only when a photo is shown.

**Play** (`app/(tabs)/play.tsx`, renamed from `duel.tsx`)
1. LargeHeader: league menu, "Play", Credits.
2. **Duel hero** on `surface`, radius 20. "Duel" title plus "Win 2 of 3 zones in 6 turns". Your deck as a horizontally scrolling row of 12 hand-size cards. Record "W 7 · D 1 · L 4 · Best ×8". A full-width primary `Play` button. Loan cards carry a small "Loan" caption.
3. A **Who's this?** row: a "?" tile, "Name 5 players a day", and a chevron.
4. **How it works**: five Rows (the existing RULES copy), collapsed under "How to play ›".

**Who's this?** (`app/guess.tsx`)
- The mystery card is the full card in **photos-off mode**, with the letter replaced by "?", the name replaced by "? ? ?" and the stats visible.
- Below it, four option Rows (52 tall, full width, radius 12 on `surface`). Right turns the row winSoft with a check. Wrong turns it lossSoft, and the right one is shown.
- Then the card flips to its Premium variant, with a reward line "+25 credits · +10 boosters".

**You sheet** (`app/profile.tsx`, modal)
- Your teams (edit).
- Picks: You vs Model (points, accuracy).
- Duel record.
- Data and credits, Privacy, Support (the old about rows).
- A footer: "FootSnap is free. No purchases, no betting."

## 6. The card (developer 2; `components/SnapCard.tsx`)

### Contract (keep or extend; other screens depend on it)

```ts
type CardSize = 'full' | 'grid' | 'hand' | 'board';     // was 'sm'|'md'|'lg' → map lg→full, md/sm→grid
<SnapCard
  card={PlayerCard} size? width? look?={Look}          // Look = { tier, finish, premium } unchanged
  flipped? interactive? idleShimmer? collected? competition? loadPhoto?
  power?={number}            // board: current Power (colours win/loss against cardStats base)
  state?={'pending' | 'unaffordable'}                  // duel
/>
export { cardHeight, CardBack, PhotoCredit, BASE_LOOK, Look, breaksFrame }  // keep these exports
```

`KitArt`, `Badges`, `RARITY_FRAME`, `frameOf` and `FRAME_*` are retired. `guess.tsx` and `arena.tsx` must stop importing them, which falls to developers 2 and 3 respectively. Until then, developer 2 leaves them exported.

### Geometry

All values are in % of card width `w` (the mock uses `cqw`). The box is w × 1.4w. The silhouette is `cardPath(w, inset)` in `constants/design.ts`. It's a 300×420 polygon: top corners chamfered at 20 units, straight sides to y = 388, a shield point at (150, 420), corners rounded by 6.

- **Rim:** the outer path filled with `metal[m].rim` (a 135° linear gradient, 7 stops), plus a 1 px outer edge `rgba(0,0,0,.6)`.
- **Face window:** `cardPath(w, 7)`. Everything in the face is clipped to it. 1 px inner edge `rgba(0,0,0,.7)`.
- **Engraved hairline:** `cardPath(w, 11.5)`, 0.8 px stroke of the rim gradient at 55% (Legend: `#E9C46A` at 90%). Hidden at hand and board sizes.
- **Drop shadow:** `0 2.4% 4.5% rgba(0,0,0,.6)` for full and grid, `0 1% 2%` for hand and board.

### Layer stack, bottom to top

1. Rim.
2. Face (clipped):
   - a. base linear gradient, vertical: `faceTop` 0% → `faceMid` 52% → `faceBottom` 100%.
   - b. club wash: an ellipse 70 × 34 at (0%, 100%), club primary at 16%.
   - c. top light: an ellipse 110 × 30 at (50%, −4%), the metal glow at `glowAlpha × .4`.
   - d. **halo**: an ellipse 34 × 32 at (58%, 27%), the glow at `glowAlpha` → ×0.35 at 45% → 0.
   - e. engraving: 118° lines 0.22 wide every 1.25, white 3%, masked to the halo.
   - f. **art**: the photo, or the monogram for photos off.
   - g. vignette: a linear dark plate (transparent to 58%, black 42% at 72%, black 62% at 100%), plus an edge radial (transparent to 60%, black 40%).
3. Hairline and inner edge.
4. The breakout copy of the photo (when breaking out).
5. Type.
6. Sheen (all cards), holo (foil cards), glare (interactive only).
7. Dimmer: uncollected cards get the outer path in `rgba(10,10,12,.62)` plus grayscale art. **Never see-through.**

**Implementation:** draw the rim, face, art and finishes in **one `react-native-svg` tree**. Use `<ClipPath>` with the face path; `<Image href>` with an SVG `<Mask>` of linear gradients for the photo fades; `RadialGradient` and `LinearGradient` rects for the layers. Do **text in SVG `<Text>`** with gradient fills for the Power numeral, or in RN `Text` positioned absolutely. This works on iOS, Android and web. Animate the sheen and holo with `useAnimatedProps` on the gradient rect's `x`, or a `G` translate. `mixBlendMode` (RN ≥ 0.77, New Architecture, which SDK 54 has by default) gives soft-light and overlay. Where it's unavailable, use plain white at 60% of the listed alpha.

### Photo placement (art 600×800; eyes at 33% and face height 31% on every cut-out)

| size | width | left | top |
|---|---|---|---|
| full | 86 | 15 | 3.2 (eyes land at 41) |
| full, breakout | 100 | 8 | −3 − headTop × 133.33 (the head top lands at −3) |
| grid / hand | 112 | −1 | −11 |
| board | 150 | −25 | −24 (the face fills it) |

- The fade mask is the intersection of two gradients. Horizontal: transparent → opaque over the first 9% of the image width, which hides the cut-out's hard left edge (the right edge is clipped by the window). Vertical: opaque to 57% of the image height, transparent at 80%.
- **Breakout:** a second, unmasked copy at the same position, clipped to y < 4.4 (the top 2.3 of the face plus everything above the card). The head then rises over the rim and out of the card.
- **When the card breaks out:** `breaksFrame()` stays the rule (tier ≥ 1, Icon, Elite), but at full size only. Grid and smaller never break out; it reads as clutter at 110.

### Type, full size (all in % of w)

- **Left column**, centred on x = 16, starting at y 8.5:
  - Power: Inter Tight 800, 16, line height .86, tracking −5%, filled with `metal.numeral` (vertical stops at 0/46/54/100), shadow 0 .35 .45 black 60%.
  - Position: "FWD / MID / DEF / GK" (from `line`), Inter Tight 800 4.4, +10%, `ink`, 1.6 below.
  - A rule 8 × 0.32 `line`, 2.6 above and 2.4 below.
  - Nation as a FIFA trigram ("NOR"), Inter 600 3.6, +14%, `ink` at 80%.
  - A kit dot 6.4 (ring 0.5 black 45% + 0.9 `line`), 3 below.
  - The club code (TLA) Inter 700 3.3, +14%, 1.8 below.
- **Cost gem**, top-right: right 6, top 7.5, diameter 13. A 0.95 metal ring (the rim gradient), then a gem radial at (34%, 28%): `#8DB3FF` 0 → `#2C64E8` 40% → `#2350C8` 74% → `#17337F`. Inner highlight 0 .45 .6 white 40%. Number: Inter Tight 800 7.2, white, shadow.
- **Name**: y 95.5, Inter Tight 800 8.6, caps, +1%, `name`, centred, shadow 0 .4 1.4 black 70%. `banner` (≤ 13 chars), shrunk to fit 92 wide, min 6.4.
- **Name rule**: y 106.6, x 14–86, 0.3 tall, `line` fading at both ends.
- **Stats row**: y 110.2, x 9–91, four equal columns with 0.25 dividers at 45%.
  - Value: Inter Tight 700 6.4, −2%, `stat`. Label: Inter 600 2.55, +16%, `ink` at 80%, 1.1 gap.
  - **Slots:** `GLS` goals · `AST` assists, or `G/GM` (goals ÷ played, 2 dp) when assists is null · `APP` played · `AGE`.
  - No season stats (not a top-20 scorer): the row becomes the first trait ability, its title in caps 2.55 and its text in Inter 500 3.7 / 1.3, max two lines. **Never print a fake 0.**
- **Footer**: y 127.4, Inter 600 2.2, +24%, caps, `ink` at 70%: "PREMIER LEAGUE · 26/27". Legend cards read "LEGEND · GILDED · 26/27".

### Other sizes

- **Grid (≈ 110):**
  - Power at left 7, top 7, size 22.
  - Cost gem at right 6, top 6.5, diameter 21 (number 12).
  - Name at y 105.5, Inter Tight 800 11.2 / 1.2 (room for diacritics such as JOÃO), with a metal tick 22 × 0.9, 4.2 below it.
  - There's no left column, stats or footer.
- **Hand (≈ 74):** the grid layout without the name. Unaffordable cards get a grey gem (`#6A6F7A` → `#25282E`) and the number at 70%. Playable cards lift 4 pt while pressed.
- **Board (≈ 54–56):**
  - Art only, plus the **current Power** centred, bottom 12, Inter Tight 800 40, white with a heavy shadow. The number is `win` when above base and `loss` when below.
  - No cost, no name.
  - Pending (queued, not revealed): 75% opacity plus a 3 pt `accentText` glow. Tap to take it back.

### Metals

| rarity (data) | metal | rim | face top / mid / bottom | glow (rgb, α) | foil |
|---|---|---|---|---|---|
| common | **Bronze** | copper 7-stop | `#2E1C11` / `#150E0A` / `#0B0705` | 222,150,96 · .26 | sheen |
| rare | **Silver** | steel 7-stop | `#20252B` / `#0F1114` / `#08090B` | 205,215,228 · .20 | sheen |
| elite | **Gold** | gold 7-stop | `#2C2010` / `#120E08` / `#0A0805` | 240,196,100 · .28 | sheen + gold glints |
| icon | **Icon** | pearl platinum (white, lilac, ice, cream) | `#1F1E36` / `#0E0E16` / `#08080D` | 200,210,255 · .24 | sheen + pearl holo |
| tier 6 | **Legend** | obsidian 6-stop + gold hairline + gold inner edge | `#17130B` / `#08080A` / `#050506` | 236,196,110 · .20 | per finish |

Exact stops are in `constants/design.ts → metal`.

### Finishes (driven by tilt: device motion or touch; idle sweep on full cards)

- **Sheen (every card):** a 112° band (transparent → white 26% → white 8% → transparent across 52% of the width), blended soft-light, centred at x = tilt%.
- **Gold glints:** a 115° band of `#FFECAA` at 90% / white 70%, overlay at 32%, plus faint 60° hatch lines at 25%.
- **Pearl holo (Icon, and Holo tier 5 on any rarity):** a pastel 115° rainbow (pink, cream, mint, periwinkle, lilac), background-size 240%, position = tilt, overlay at 16%. Prismatic (Legend) uses a saturated rainbow in colour-dodge at 26%.
- **Glare (interactive only):** a 70-radius radial at the touch point, white 18%, overlay.
- **Tilt:** rotateY = (x − 50) × 0.2°, rotateX = (50 − y) × 0.2° (so ≤ 10°), with perspective 1100. Release springs back.

### Upgrade tiers (cosmetic, stats never change; names in `lib/collection.ts` unchanged, effect texts updated)

| tier | name | effect |
|---|---|---|
| 1 | Breakout | Photo: the head breaks the frame. Photos off: the medallion grows to 58 and its ring crosses the top hairline |
| 2 | Depth | The art layer translates against the tilt by up to 2.5 w, and the type by 1 w (parallax) |
| 3 | Pulse | The halo breathes in the club colour (2.4 s loop, α ±30%; static under reduced motion) |
| 4 | Crest | Crests on: the crest embossed top-right at 8%. Off: the club TLA set at 40 w, engraved at 6% behind the art |
| 5 | Holo | Pearl holo on any rarity |
| 6 | Legend | The obsidian frame plus a finish. Gilded: gold glints at 45%. Prismatic: saturated rainbow. Crackle: a fine gold crackle network at 18% over the face (SVG, seeded by player id). Starfield: about 40 static 0.4 w specks at 30–70% white, under the sheen |

**Premium** (from Who's this?):
- **Photo:** a white sticker outline 1.2 w around the cut-out, made from 8 offset tinted copies (the existing technique), and the name filled with the gold numeral gradient.
- **Photos off:** the medallion ring and the letter go gold whatever the rarity.

### Photos off (`EXPO_PUBLIC_SHOW_PHOTOS=false`, about 70% of players even with photos on)

- **Sash:** a band 30 tall, rotated −28° about the face, centred at y 46, 180 wide. It's filled with club primary at 50% opacity and edged with secondary pinstripes (1.6% stripe, 3.9% gap, both sides). The ends fade 8–34% and 66–92%. This is the kit, abstracted; there's no shirt drawing.
- **Medallion:** diameter 50 centred at (56, 44).
  - Fill: a radial from `faceTop` to `faceBottom`.
  - Concentric engraved rings: white 7%, 0.2 wide, every 1.05. This is circular graining, not rays. **Never a sunburst.**
  - Inner shadow 0.55 black 55%, a metal ring 0.9 wide outside it, and a drop shadow 0 2 5 black 55%.
- **Letter:** the first letter of the surname (last word of `banner`, keeping Ø, Ö, É and so on), Inter Tight 800 29, −4%, filled with `metal.numeral`, shadow 0 .5 .5 black 70% plus a top highlight −.2 white 12%.
- **Grid and hand:** the medallion is 62 at (55, 50) with the letter at 36. **Board:** no medallion; the letter is 58 at 55% opacity, centred at y 44.
- **Crests off:** the kit dot and TLA in the left column already carry the club. The card never needs a crest.

### Back (flipped)

- The same rim. The face is the base gradient only.
- Top: name (Inter Tight 800 7, caps), then "Man City · Forward · Norway · 26".
- **Season table:** rows of label and value (Goals, Assists, Penalties, Appearances, Goals per game, Rank "#1 of 20 scorers"). Inter 500 3.8, `stat`, hairline `line`.
- **Duel:** "Cost 6 · Power 12" plus the effect.
- **"How it's worked out":** two lines from `lib/game.ts`. For example: "Cost 6: Icon rarity. Power 12: 10 for cost 6 + 2 for 9 goals (1 per 4)."
- The photo credit (photo cards only).

### Card back for packs (`CardBack`)

- A graphite rim (the Silver stops at 60% brightness) and a face of `#0E0E12`.
- Concentric rings across the whole face (as on the medallion), with the FootSnap mark centred: the card silhouette at 18 w, outlined 0.5 in gold, with "FOOTSNAP" below it (Inter Tight 800 4.4, +24%, `#E9C46A`).

## 7. Duel board (developer 3; `app/arena.tsx`)

The mock shows the layout.

- **Top bar** (48):
  - Retreat (a flag icon in a 36 circle on `raised`; confirm in a Sheet: "Retreat and lose ×1?").
  - Centre: "Turn 4" 15/700 over six 16×3 ticks (done `text2`, now `accentText`, future `hairlineStrong`).
  - Right: a **"Prize ×2"** pill (`raised`, 12 `text3` + 15/700).
- **Opponent line:** an "AI" avatar 22 plus "AI Manager · 3 cards in hand".
- **Three zone lanes** (equal columns, gap 8). Each lane is a rounded 16 strip at white 1.8–3% (vertical gradient).
  - The opponent's 2×2 slots align to the plate, then the **zone plate**, then your 2×2 slots.
  - Empty slots are the card silhouette at white 2.6%, so the board always reads as a board.
  - Pieces are 54 wide.
- **Zone plate** (`surface`, radius 14, 1 px hairline inset, 112 tall), top to bottom:
  - Their Power (18/700; `loss` when they lead).
  - The zone name (10 caps `text3`), the condition (13/600) and its text (11 `text2`), or "Hidden · Reveals turn N".
  - Your Power (18/700; `text` when you lead), plus pending "+5" in `accentText`.
  - A tie shows both in `text2`. A revealed condition flips in (Y, 320).
- **Hand:** cards at 74, centred, gap 10, scrolling sideways if there are more than 4. Tap a card, then a zone, to queue it; the zone lane highlights in `accentSoft` while a card is selected. Drag to a zone is optional.
- **Action bar:** the energy gem 40 (the same gem as the card cost) with "Energy · 1 of 4 left". Then a secondary `Press` (doubles the prize; once per side). Then a primary `End turn` filling the rest.
- **Reveal:** cards land in queue order (the engine's), one every 260 ms. Each lands with scale 1.08 → 1 and a light haptic. Zone numbers tick to their new values (200 ms, tabular, no rolling digits). Under reduced motion they land instantly.
- **End sheet:** "You won 2 zones · +40 credits", with the zones as three mini plates, then `Play again` and `Done`.

## 8. Pack opening (developer 2; `app/pack.tsx`, fullScreenModal)

1. **Sealed.**
   - The stage is `bg` with a radial tint by competition-neutral gold (`rgba(240,200,110,.10)`).
   - The pack is a sleeve 240 × 336 in the card silhouette. Gold rim, `#0E0E12` face with engraved rings, the FootSnap mark, the competition name (Inter 600 13, caps, +20%) and "5 CARDS". The idle sheen sweeps every 4 s.
   - Below: "Swipe across the top to open" with the odds row "Icon 4% · Gold 12% · Silver 24% · Bronze 60%" (`text3`), and a primary `Open` button as the accessible alternative.
2. **Tear.**
   - A swipe or the button: medium haptic.
   - The top 12% of the sleeve slides off right, rotating 8° (220).
   - The sleeve drops 40 pt and fades (320). Five `CardBack`s rise into a stack (stagger 60).
3. **Reveal**, one tap per card, lowest rarity first and the best last.
   - Before the flip, the back **telegraphs** the rarity at its edge:
     - Bronze: nothing.
     - Silver: one cool glint along the rim (400).
     - Gold: a warm glow behind the card (shadow 32, `#F0C464` at 40%, pulsing once).
     - Icon: the stage dims to 85% black, a white edge light builds over 700, then the flip, a single 120 ms white flash and a heavy haptic.
   - The flip is 480 rotateY.
   - Under the card: a "NEW" chip (`accent`) or "Duplicate · +10 credits · +5 boosters" (`text2`).
4. **Summary.**
   - The five cards at grid size (3 + 2), then "+20 credits for opening".
   - `Done` (primary) and `View collection` (secondary).
5. **Reduced motion:** no tear (crossfade), no flips (crossfade 200), the teaser shown as a static label ("Gold") above the back, no flash. Haptics stay.

## 9. Data needs (all from existing sources)

- **`CardTeam.tla`**: add it in `lib/cards.ts` from `team.tla` (falling back to the first 3 letters of `shortName`, uppercased). Owned by developer 2; additive.
- **`lib/nations.ts`** (developer 2): a static map from football-data nationality to FIFA trigram (England ENG, Norway NOR, Sweden SWE…). Fall back to the first 3 letters uppercased.
- **Favourites store and `useHomeFixtures(favorites)`** (developer 1): `lib/storage.ts` and `hooks/data.ts`.
- **Season label** "26/27": from `StandingsResponse.season.startDate/endDate`, or from the match dates. Developer 2 derives it in `lib/cards.ts` as an optional `season` on the card set, or the card computes it from `competition` props passed by the caller.
- **Nothing on a card is invented.** If assists is null, show G/GM. If there are no stats, show the trait. Never show a 0 the data doesn't contain.

## 10. Copy rules (App Store: no gambling)

- Say "chance", "points", "pick", "prize", "credits". **Never** say "odds", "bet", "wager", "stake", "payout", "line", "market", "cash", "win money".
- Probabilities are whole % (Math.round). Show "<1%" rather than "0%".
- Every place a pick can be made carries "Free · points only" or "+2 points if right".
- Sentence case everywhere except overlines and the card's own type.
- Numbers are always tabular. Use an en dash in scores ("1–1") and a true minus in "−2".

## 11. Fonts (developer 1 installs)

```bash
npx expo install @expo-google-fonts/inter @expo-google-fonts/inter-tight   # both ^0.4.2
```

Register them in `app/_layout.tsx` `useFonts`:
- `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold`, `Inter_800ExtraBold`
- `InterTight_700Bold`, `InterTight_800ExtraBold`

Keep the Barlow and Big Shoulders packages registered **until nothing imports `constants/theme.ts`**. Then remove the packages and theme.ts in one final commit (developer 1, after developers 2 and 3 report done). `StatusBar style="light"`. The Stack `contentStyle` is `color.bg`.

## 12. File ownership (no file is edited by two developers)

**Developer 1: foundation, shell, data screens**
- `package.json`, `package-lock.json`, `app.json`
- `constants/design.ts` (from now on; developers 2 and 3 request token changes from developer 1), `constants/theme.ts` (deletion at the end), `constants/leagues.ts`
- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx` (Home), `app/(tabs)/matches.tsx` (new), `app/(tabs)/table.tsx` and `app/(tabs)/picks.tsx` (delete once Matches ships), `app/match/[id].tsx`, `app/club/[id].tsx`, `app/about.tsx`, `app/profile.tsx` (new), `app/teams.tsx` (new, the favourite picker)
- `components/ui.tsx`, `components/Match.tsx`, `components/Charts.tsx`
- `context/league.tsx`, `hooks/data.ts`, `hooks/useApi.ts`, `services/api.ts`
- `lib/storage.ts`, `lib/football.ts`, `lib/model.ts`, `lib/season.ts`, `lib/picks.ts`, `lib/colors.ts`, `lib/proxy.ts`, `api/fd.ts`
- Tests for those libs.

**Developer 2: cards**
- `components/SnapCard.tsx` and any new `components/card/*`
- `app/(tabs)/cards.tsx`, `app/card/[id].tsx`, `app/pack.tsx`, `app/guess.tsx`
- `lib/cards.ts`, `lib/collection.ts`, `lib/art.ts`, `lib/packs.ts`, `lib/guess.ts`, `lib/nations.ts` (new)
- `scripts/art/*`, `public/art/*`
- Tests for those libs.

**Developer 3: duel**
- `app/(tabs)/play.tsx` (`git mv app/(tabs)/duel.tsx`; developer 1's tab layout lists the route `play`)
- `app/arena.tsx`, any new `components/duel/*`
- `lib/game.ts`, `lib/decks.ts`, `lib/rng.ts`
- Tests for those libs.

**Unowned, read-only during the redesign:** `docs/redesign/*`, `public/mock/*`, `lib/types.ts`. A change to `lib/types.ts` goes through developer 1.

**Cross-boundary contracts:**
- Developers 2 and 3 import only these from `components/ui.tsx`: `tap`, `Button`, `Credits`/`Wallet`, `Screen`, `LargeHeader`, `NavBar`, `Segmented`, `Row`, `Sheet`, `ProgressBar`, `KitChip`, with the signatures in §3. Developer 1 lands the signatures first, restyling later is fine, so nobody waits.
- Developer 3 renders cards only through `<SnapCard size="hand" | "board" power state>` (§6). Until developer 2 lands it, they pass `width` to the current SnapCard.

## 13. Done means

- `npm run typecheck` and `npm test` pass. `expo export` builds iOS, Android and web.
- Every text colour is in the §2 table, or its contrast was computed and added there.
- It's checked at 375 and 430 pt wide. The card grid never overflows: width = (screen − 40 − 20) / 3.
- Both builds have been looked at: photos on, and `EXPO_PUBLIC_SHOW_PHOTOS=false EXPO_PUBLIC_SHOW_CRESTS=false`. Every card screen looks intentional in both.
- Reduced motion: no tilt, sheen sweep, flips, tear or flash. Duel reveals are instant.
- No string in the app matches `/\b(odds|bet|wager|stake|payout)\b/i` (grep it).
