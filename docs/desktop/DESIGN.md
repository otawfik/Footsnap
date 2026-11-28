# FootSnap on a computer screen

FootSnap was drawn for a phone. Opened on a laptop it was the phone layout stretched to the window: the same
single column, the same bottom tab bar, every row and button as wide as the monitor. This is the plan for a real
desktop layout. Before screenshots are in [`before/`](before), after screenshots in [`after/`](after).

## What was wrong (from the before screenshots, 1440 × 900 unless noted)

| Screen | What was wrong |
|---|---|
| Every tab | A four-item **bottom tab bar** spread across 1440 px, icons 350 px apart. No brand, no competition switcher, no way to reach Beat the model or the model report except through rows deep in other screens. |
| Home | One column. "Pick your teams", the pack and each fixture were **1400 px wide bars**: team names at the far left, chances at the far right, nothing but gradient between. Only three fixtures shown and no table, although there was room for both. The page ended half-way down the window. |
| Matches · Fixtures | Each fixture market ran the full width: a probability bar 1300 px long whose "64%" sat a hand's width from the club name. Three full-width segments as the main control. One fixture and a half visible per screen. |
| Matches · Table | 20 rows with the club at the far left and P / GD / Pts crammed against the right edge, 1100 px of empty row in between. Only three stat columns although the data has W / D / L / GF / GA. Header scrolled away. |
| Matches · Projections | Same shape: three small percentage columns at the right edge. The "What if" scores were below the table, so setting one meant scrolling down, then back up to see what moved. |
| Match | The kit hero was drawn for a 600 px width and scaled up (soft, 176 px tall across the whole window). The chance chart was **1380 × 210**: stretched flat, the lines nearly horizontal. Scores, form and "what this result means" were stacked full-width under it, so one match was four screens of scrolling with most of each screen empty. Key cards sat alone in the middle of the last one. |
| Club | Left-aligned header, then full-width fixture markets as on Matches. Squad and Stats hidden behind a segmented control although all three would fit side by side. |
| Cards | The grid stayed **three across, capped at 520 px, pinned to the left**; two thirds of the window was empty. Pack and "Who's this?" tiles each half the window wide. |
| Card | A full page pushed over the grid. The card was centred but its details ran in a 520 px column pinned to the *left* edge, away from the card. |
| Play | The duel hero was full width with twelve 74 px cards in a row that ended half-way across; a 660 px wide "Play" button. |
| Deck editor | The opposite problem: six cards per row, each **240 px wide**, so the twelve-card deck alone filled the screen and the collection you pick from was three scrolls away. |
| Duel | A 520 px phone board in the middle of a 1440 px pitch, cards 56 px wide; the hand at the bottom, three cards wide. |
| Who's this? / Pack | Already centred, but the pack's "Open" button was stuck to the left edge under a centred pack (a real bug at any width over 420 px). |
| Model report | Brier bars 1400 px long. The calibration chart was 220 px in a 1440 px row, its explanation as one 190-character line. |
| Beat the model | Full-width fixture cards with three segments each 440 px wide. Your record on top, pushing the calls down. |
| You / Your teams / About | Lists stretched to the full width: a row's title at the left edge and its chevron at the right, 1400 px apart. Prose lines of 200 characters. |
| Sheets | The competition menu slid up from the bottom edge, full width, like a phone sheet. |
| Everywhere | No hover states, no visible keyboard focus, hidden scrollbars. At 1920 all of it got proportionally worse. |

At 390 px the app is good. Nothing below may change it.

## Principles

1. **One shell.** From 1024 px the bottom tab bar is replaced by a left sidebar on every route: brand, the four
   sections, Beat the model, the model report, Your teams, the competition switcher, credits and profile, and an
   install button when the browser offers one. Up to 1280 px it is 76 px of icons with small labels (the tab bar
   turned on its side); from 1280 px it is 248 px with full labels and all six competitions listed.
2. **A page, not a window.** Content sits in a centred page of at most 1240 px with 40 px gutters. From 768 to
   1023 px (tablets) the phone layout is kept but capped at 760 px and centred.
3. **Columns that mean something.** Screens are split into a main column and a 340 px right rail (380 px from
   1600 px). The rail carries context a phone has no room for: the table next to the fixtures, the title race, your
   record. Text-only screens get a reading column instead.
4. **Density.** Fixtures go two across. Tables gain the columns the data already has. Prose is capped near 68
   characters. Figures stay tabular.
5. **Charts keep their shape.** A chart's height comes from its width (roughly 2.4 : 1, clamped), never a fixed
   phone height across a desktop width.
6. **Desktop manners.** Hover on anything pressable, a visible focus ring for keyboard users, arrow keys on the
   matchday stepper, Esc to close, sheets as centred dialogs, a visible (thin) scrollbar.
7. **Same identity.** Royal ink ground, chalk text, kit-colour gradients, metal-rim cards, Inter / Inter Tight.
   Nothing is restyled; it is re-laid-out.

## Screen by screen

- **Home.** Main: Live now, Your teams (fixture markets two across), then the *whole* matchday as compact
  rows two across with your points. Rail: daily pack, the table (top of the table, your teams' rows kept), title
  race (top five title chances from the season simulation), Beat the model.
- **Matches.** The mode control becomes a compact tab strip. *Fixtures*: markets two across, with the table in
  the rail. *Table*: the full table with W / D / L / GF / GA and form, a sticky header, and the projections
  (title, top 4, relegation) as heat cells in the same rows. *Projections*: the projection table on the left and
  the "What if" scores in a sticky rail beside it, so a pinned score and the table it moves are on screen together.
- **Match.** Hero redrawn at the page width. Main: the model's chance, the chance-through-the-match chart at a
  readable ratio, likeliest scores *and* the full score grid side by side, the points race. Rail: your pick, what
  this result means, last five, key cards.
- **Club.** Header in the club's kit across the page. Main: fixtures two across (or squad as a card grid). Rail:
  the season's numbers and where the club stands in the table.
- **Cards.** The collection fills the page: 5 to 8 cards across, hover lift. Level, pack and "Who's this?" share
  one row above the filters. Opening a card shows it as a two-column dialog (card left, details right).
- **Play.** The duel hero in the main column with the deck wrapped rather than scrolled; rules, record and the
  other games in the rail.
- **Deck editor.** The deck as a compact strip on the left with the curve and grounds; the collection in a dense
  grid beside it.
- **Duel.** A wide board: the three stadiums across the centre at up to 2.3× their phone size, the hand along the
  bottom at card size, the turn, energy and actions in a bar that spans the board.
- **Model / Beat.** Charts beside their explanation at 2.4 : 1; bars capped; tables use the width. Beat puts the
  calls in the main column and your record in a sticky rail.
- **You / Your teams / About.** A reading column; Your teams as a two-column club list.

## How it is built

- `lib/layout.ts`: the rules (breakpoints, sidebar and page widths, grid maths) and the stylesheet behind them.
  Pure and tested (`tests/layout.test.ts`).
- `components/layout.tsx`: `useBreakpoint()`, `useMeasure()`, `Columns` / `Main` / `Rail`, `Grid2`,
  `DesktopOnly` / `PhoneOnly`.
- `components/Shell.tsx`: the sidebar.

**Hydration.** The web build is pre-rendered without a window size, and the first client render has to match that
HTML or React discards it (error #418). So nothing that is in the pre-rendered HTML depends on the window width in
JavaScript: the shell, the page width, the column tracks and the grids are CSS media queries on `data-fs`
attributes, identical markup at every width. Sizes only JavaScript can compute (how wide a card or a chart is) come
from `useBreakpoint()`, which reports "phone" until the page has hydrated, the same approach as `lib/storage.ts`.
The rail's track is always in the markup, so the main column does not jump when the rail's content arrives.
