/**
 * Duel abilities: every card gets one, built from the card's real data and never
 * from invented facts.
 *
 * football-data's squad lists only say Goalkeeper / Defence / Midfield / Offence, so
 * a card's ARCHETYPE is its line, and its ROLE (the mechanic) comes from the most
 * telling true thing about it, in this order:
 *   1. a SIGNATURE: hand-tuned two-part abilities for the 30 biggest cards by Power
 *      across the five leagues (player ids below), with numbers read live from the
 *      player's season, so they stay true as the season moves. A signature that
 *      needs season stats falls back to 2-4 when the player has none listed.
 *   2. the SEASON (top-20 scorers only): Golden Boot leader, penalties, clinical
 *      finishing, assists, open-play goals.
 *   3. a TRAIT: age (20 or under, 33 or over), a rare passport, home nation.
 *   4. a LINE VARIANT: one of four mechanics for the line, picked by player id so a
 *      card always plays the same way. Its "why" line only says the player's position
 *      and club, which the data does say.
 *
 * Triggers use FootSnap's own words:
 *   Kick-off   when the card is revealed
 *   While here as long as the card is on the board
 *   Every turn at the end of each turn
 *   Full time  once, after the last turn, before the stadiums are scored
 *
 * `why` is the fact the ability is built from, shown under it on the card view;
 * tests check every number in it against the card's data.
 */
import type { PlayerCard } from './cards';
import { teamCode } from './cards';
import { hash } from './rng';

export type Trigger = 'kickoff' | 'while' | 'turn' | 'fulltime';
export const TRIGGER_NAME: Record<Trigger, string> = { kickoff: 'Kick-off', while: 'While here', turn: 'Every turn', fulltime: 'Full time' };

export type PartKind =
  | 'highest' // while: +n if your highest-Power card here
  | 'withMates' // while: +n per other card you have here
  | 'alone' // kick-off: +n if your only card here
  | 'outnumbered' // kick-off: +n if the other side has more cards here
  | 'behind' // kick-off: +n if you're behind here
  | 'emptyHere' // kick-off: +n if the other side has no cards here
  | 'boostHere' // kick-off: +n to your other cards here
  | 'boostOthers' // kick-off: +n to your strongest card at each other stadium
  | 'grow' // every turn: +n
  | 'late' // while: +n if played on turn 5 or 6
  | 'draw' // kick-off: draw n
  | 'mark' // while: enemy cards here −n (doesn't stack)
  | 'tackle' // kick-off: −n to the enemy's strongest card here
  | 'pairDef' // while: +n if you have another defender here
  | 'lastDitch' // full time: +n if you're behind here
  | 'stop' // kick-off: −n to every enemy card here
  | 'captain' // while: your other cards here +n
  | 'homeHero' // while: +n more at his club's stadium
  | 'roamer' // while: +n away from his club's stadium
  | 'pens' // full time: +n (his league penalties)
  | 'spread' // while: +n if you have cards at all three stadiums
  | 'clubmates' // while: +n per other card from his club you have in play (max 3)
  | 'countrymen'; // while: +n per other card from his country you have here

export const PART_TRIGGER: Record<PartKind, Trigger> = {
  highest: 'while',
  withMates: 'while',
  alone: 'kickoff',
  outnumbered: 'kickoff',
  behind: 'kickoff',
  emptyHere: 'kickoff',
  boostHere: 'kickoff',
  boostOthers: 'kickoff',
  grow: 'turn',
  late: 'while',
  draw: 'kickoff',
  mark: 'while',
  tackle: 'kickoff',
  pairDef: 'while',
  lastDitch: 'fulltime',
  stop: 'kickoff',
  captain: 'while',
  homeHero: 'while',
  roamer: 'while',
  pens: 'fulltime',
  spread: 'while',
  clubmates: 'while',
  countrymen: 'while',
};

export interface Part {
  kind: PartKind;
  n: number;
}

export type Archetype = 'Forward' | 'Midfielder' | 'Defender' | 'Goalkeeper';

export interface DuelAbility {
  /** the role's name ("Clinical", "Ball winner", "Signature") */
  title: string;
  /** what it does, trigger first ("Kick-off: +4 Power if this is your only card here.") */
  text: string;
  /** the true fact it's built from */
  why: string;
  parts: Part[];
  archetype: Archetype;
  /** for balance reports: 'signature', a season role, a trait role, or `${line}-variant` */
  role: string;
  signature?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One part as text, trigger first. `club`/`nation` fill the club- and country-based ones. */
export function partText(p: Part, card: Pick<PlayerCard, 'team' | 'nationality'>): string {
  const t = TRIGGER_NAME[PART_TRIGGER[p.kind]];
  const club = card.team.shortName;
  const body = (() => {
    switch (p.kind) {
      case 'highest':
        return `+${p.n} Power if this is your strongest card here.`;
      case 'withMates':
        return `+${p.n} Power for each other card you have here.`;
      case 'alone':
        return `+${p.n} Power if this is your only card here.`;
      case 'outnumbered':
        return `+${p.n} Power if they have more cards here.`;
      case 'behind':
        return `+${p.n} Power if you're behind here.`;
      case 'emptyHere':
        return `+${p.n} Power if they have no cards here.`;
      case 'boostHere':
        return `+${p.n} Power to your other cards here.`;
      case 'boostOthers':
        return `+${p.n} Power to your strongest card at each other stadium.`;
      case 'grow':
        return `+${p.n} Power.`;
      case 'late':
        return `+${p.n} Power if played on turn 5 or 6.`;
      case 'draw':
        return p.n === 1 ? 'draw a card.' : `draw ${p.n} cards.`;
      case 'mark':
        return `enemy cards here have −${p.n} Power (doesn't stack).`;
      case 'tackle':
        return `−${p.n} Power to their strongest card here.`;
      case 'pairDef':
        return `+${p.n} Power if you have another defender here.`;
      case 'lastDitch':
        return `+${p.n} Power if you're behind here.`;
      case 'stop':
        return `−${p.n} Power to every enemy card here.`;
      case 'captain':
        return `your other cards here have +${p.n} Power.`;
      case 'homeHero':
        return `+${p.n} more Power at ${club}'s stadium.`;
      case 'roamer':
        return `+${p.n} Power away from ${club}'s stadium.`;
      case 'pens':
        return `+${p.n} Power, one per league penalty he's scored (max ${PENS_CAP}).`;
      case 'spread':
        return `+${p.n} Power if you have cards at all three stadiums.`;
      case 'clubmates':
        return `+${p.n} Power for each other ${club} card you have in play (max 3).`;
      case 'countrymen':
        return `+${p.n} Power for each other card from ${card.nationality ?? 'his country'} you have here.`;
    }
  })();
  return `${t}: ${body}`;
}

/** the most penalties a Full time bonus counts */
export const PENS_CAP = 4;

type Card = Pick<PlayerCard, 'id' | 'line' | 'position' | 'age' | 'nationality' | 'team' | 'stats' | 'abilities' | 'rank'>;

interface Sig {
  /** the season numbers the parts read; null when the card has no stats listed */
  build: (c: Card, s: NonNullable<Card['stats']>) => Part[];
}

const pens = (s: NonNullable<Card['stats']>): Part[] => (s.penalties ? [{ kind: 'pens', n: Math.min(PENS_CAP, s.penalties) }] : []);
const growOrNot = (c: Card): Part[] => (c.age !== null && c.age <= 21 ? [{ kind: 'grow', n: 1 }] : []);
const lateOrNot = (c: Card, n: number): Part[] => (c.age !== null && c.age >= 33 ? [{ kind: 'late', n }] : []);

/**
 * Signatures for the 30 biggest cards by Power across the five leagues when they were
 * tuned (football-data player ids). Every part is either a pure mechanic or reads the
 * player's live numbers (penalties), and age-based parts check his real age, so the
 * text stays true. Each falls back to a second mechanic when the data-based one
 * doesn't apply, so every signature has two parts.
 */
const SIGNATURES: Record<number, Sig> = {
  37428: { build: (c, s) => [{ kind: 'boostHere', n: 1 }, ...(pens(s).length ? pens(s) : [{ kind: 'highest' as const, n: 2 }])] }, // Raphinha
  3374: { build: (c, s) => [{ kind: 'highest', n: 3 }, ...(pens(s).length ? pens(s) : [{ kind: 'roamer' as const, n: 2 }])] }, // Mbappé
  202283: { build: (c) => [{ kind: 'boostHere', n: 1 }, ...(growOrNot(c).length ? growOrNot(c) : [{ kind: 'spread' as const, n: 2 }])] }, // Lamine Yamal
  38101: { build: () => [{ kind: 'alone', n: 4 }, { kind: 'highest', n: 2 }] }, // Haaland
  252836: { build: (c) => [{ kind: 'outnumbered', n: 2 }, ...(growOrNot(c).length ? growOrNot(c) : [{ kind: 'behind' as const, n: 2 }])] }, // Gustavo Varela
  169216: { build: () => [{ kind: 'homeHero', n: 3 }, { kind: 'withMates', n: 1 }] }, // Antonio Raimondo
  3370: { build: (c, s) => [{ kind: 'boostHere', n: 2 }, ...(lateOrNot(c, 2).length ? lateOrNot(c, 2) : pens(s))] }, // Thauvin
  552: { build: (c, s) => [{ kind: 'boostOthers', n: 1 }, ...(pens(s).length ? pens(s) : [{ kind: 'withMates' as const, n: 1 }])] }, // Sinayoko
  265516: { build: (c) => [{ kind: 'emptyHere', n: 3 }, ...(growOrNot(c).length ? growOrNot(c) : [{ kind: 'alone' as const, n: 1 }])] }, // Zabiri
  304: { build: (c, s) => [...(pens(s).length ? pens(s) : [{ kind: 'alone' as const, n: 2 }]), ...(lateOrNot(c, 2).length ? lateOrNot(c, 2) : [{ kind: 'outnumbered' as const, n: 1 }])] }, // Füllkrug
  7457: { build: () => [{ kind: 'behind', n: 3 }, { kind: 'roamer', n: 1 }] }, // Malen
  115175: { build: () => [{ kind: 'withMates', n: 2 }, { kind: 'homeHero', n: 1 }] }, // Camello
  113765: { build: () => [{ kind: 'boostOthers', n: 1 }, { kind: 'highest', n: 2 }] }, // Olise
  120679: { build: () => [{ kind: 'draw', n: 1 }, { kind: 'alone', n: 3 }] }, // Krstović
  149850: { build: (c, s) => [{ kind: 'alone', n: 2 }, ...(pens(s).length ? pens(s) : [{ kind: 'behind' as const, n: 2 }])] }, // Lepaul
  2237: { build: (c, s) => [...(pens(s).length ? pens(s) : [{ kind: 'withMates' as const, n: 1 }]), ...(lateOrNot(c, 3).length ? lateOrNot(c, 3) : [{ kind: 'highest' as const, n: 1 }])] }, // Budimir
  1826: { build: () => [{ kind: 'outnumbered', n: 3 }, { kind: 'withMates', n: 1 }] }, // Schick
  103125: { build: () => [{ kind: 'boostHere', n: 1 }, { kind: 'countrymen', n: 2 }] }, // João Pedro
  6486: { build: () => [{ kind: 'emptyHere', n: 3 }, { kind: 'highest', n: 1 }] }, // Isak
  8685: { build: () => [{ kind: 'withMates', n: 1 }, { kind: 'clubmates', n: 1 }] }, // Marcus Thuram
  8476: { build: () => [{ kind: 'roamer', n: 2 }, { kind: 'draw', n: 1 }] }, // Gouiri
  214497: { build: () => [{ kind: 'behind', n: 3 }, { kind: 'outnumbered', n: 1 }] }, // Fer Niño
  213278: { build: () => [{ kind: 'boostOthers', n: 1 }, { kind: 'boostHere', n: 1 }] }, // Álex Baena
  180218: { build: () => [{ kind: 'spread', n: 3 }, { kind: 'alone', n: 1 }] }, // Roberto Fernández
  7801: { build: (c) => [...(lateOrNot(c, 4).length ? lateOrNot(c, 4) : [{ kind: 'behind' as const, n: 2 }]), { kind: 'alone', n: 1 }] }, // Aubameyang
  8004: { build: (c, s) => [{ kind: 'highest', n: 2 }, ...(s.assists && s.assists >= 3 ? [{ kind: 'boostHere' as const, n: 1 }] : pens(s).length ? pens(s) : [{ kind: 'withMates' as const, n: 1 }])] }, // Kane
  3368: { build: () => [{ kind: 'captain', n: 1 }, { kind: 'tackle', n: 1 }] }, // Rabiot
  129381: { build: (c, s) => [{ kind: 'withMates', n: 1 }, ...(pens(s).length ? pens(s) : [{ kind: 'alone' as const, n: 2 }])] }, // Tengstedt
  214533: { build: () => [{ kind: 'boostHere', n: 1 }, { kind: 'spread', n: 2 }] }, // Fermín López
  180282: { build: () => [{ kind: 'emptyHere', n: 3 }, { kind: 'behind', n: 1 }] }, // Brugui
};
export const SIGNATURE_IDS = Object.keys(SIGNATURES).map(Number);

const ARCH: Record<string, Archetype> = { FW: 'Forward', MF: 'Midfielder', DF: 'Defender', GK: 'Goalkeeper' };

/** four mechanics per line; the player id picks one */
const VARIANTS: Record<string, { title: string; part: Part }[]> = {
  FW: [
    { title: 'Counter-attack', part: { kind: 'behind', n: 3 } },
    { title: 'First on the ball', part: { kind: 'emptyHere', n: 3 } },
    { title: 'Overload', part: { kind: 'withMates', n: 1 } },
    { title: 'Lone runner', part: { kind: 'alone', n: 3 } },
  ],
  MF: [
    { title: 'Distributor', part: { kind: 'boostHere', n: 1 } },
    { title: 'Switch of play', part: { kind: 'boostOthers', n: 1 } },
    { title: 'Ball winner', part: { kind: 'tackle', n: 2 } },
    { title: 'Wide shape', part: { kind: 'spread', n: 2 } },
  ],
  DF: [
    { title: 'Marker', part: { kind: 'mark', n: 1 } },
    { title: 'Tackler', part: { kind: 'tackle', n: 2 } },
    { title: 'Partnership', part: { kind: 'pairDef', n: 2 } },
    { title: 'Last ditch', part: { kind: 'lastDitch', n: 3 } },
  ],
  GK: [
    { title: 'Shot-stopper', part: { kind: 'stop', n: 1 } },
    { title: 'Organiser', part: { kind: 'captain', n: 1 } },
    { title: 'Last line', part: { kind: 'mark', n: 1 } },
    { title: 'Clean-sheet hunt', part: { kind: 'lastDitch', n: 3 } },
  ],
};

const key = (c: Card, k: string) => c.abilities.find((a) => a.key === k);

/** The card's Duel ability (see the header for the order the roles are tried in). */
export function duelAbility(card: Card): DuelAbility {
  const ln = card.line ?? 'FW';
  const archetype = ARCH[ln];
  const club = card.team.shortName;
  const s = card.stats;
  const make = (title: string, parts: Part[], why: string, role: string, signature = false): DuelAbility => ({
    title,
    text: parts.map((p) => partText(p, card)).join(' '),
    why,
    parts,
    archetype,
    role,
    signature,
  });

  // 1. signatures
  const sig = SIGNATURES[card.id];
  if (sig && s) {
    const parts = sig.build(card, s).slice(0, 2);
    const facts = [`${plural(s.goals, 'goal')}${s.played ? ` in ${plural(s.played, 'game')}` : ''}`];
    if (s.assists) facts.push(plural(s.assists, 'assist'));
    if (s.penalties) facts.push(`${plural(s.penalties, 'penalty', 'penalties')}`);
    if (card.age !== null) facts.push(`age ${card.age}`);
    return make('Signature', parts, `${facts.join(', ')}.`, 'signature', true);
  }

  // 2. season
  if (s) {
    const top = key(card, 'top-scorer');
    if (top) return make(top.title, [{ kind: 'highest', n: 3 }], top.text, 'season-top');
    if (s.penalties !== null && s.penalties >= 2) return make('Penalty taker', [{ kind: 'pens', n: Math.min(PENS_CAP, s.penalties) }], `${s.penalties} of ${plural(s.goals, 'goal')} from the penalty spot.`, 'season-pens');
    const clin = key(card, 'clinical');
    if (clin) return make('Clinical', [{ kind: 'alone', n: 4 }], clin.text, 'season-clinical');
    if (s.assists !== null && s.assists >= 3) {
      const n = Math.min(2, Math.floor(s.assists / 3));
      return make('Playmaker', [{ kind: 'boostHere', n }], `${plural(s.assists, 'assist')} on top of ${plural(s.goals, 'goal')}.`, 'season-assists');
    }
    if (s.penalties === 0 && s.goals >= 4) return make('Open-play finisher', [{ kind: 'withMates', n: 1 }], `All ${s.goals} goals from open play.`, 'season-openplay');
    if (s.goals > 0) return make('Goal threat', [{ kind: 'outnumbered', n: 3 }], `${plural(s.goals, 'goal')}${s.played ? ` in ${plural(s.played, 'game')}` : ''} this season.`, 'season-threat');
  }

  // 3. traits
  if (card.age !== null && card.age <= 20) return make('Wonderkid', [{ kind: 'grow', n: 1 }], `${card.age} years old.`, 'trait-young');
  if (card.age !== null && card.age >= 33) return make('Veteran', [{ kind: 'late', n: 3 }], `${card.age} years old.`, 'trait-veteran');
  const rare = key(card, 'one-of-a-kind') ?? key(card, 'rare-passport');
  if (rare && ln !== 'GK') return make(rare.title, [{ kind: 'draw', n: 1 }], rare.text, 'trait-passport');
  const home = key(card, 'home-nation');
  if (home && ln !== 'GK' && ln !== 'DF') return make('Local hero', [{ kind: 'homeHero', n: 2 }], home.text, 'trait-home');

  // 4. line variant
  const vs = VARIANTS[ln];
  const v = vs[hash(`duel:${card.id}`) % vs.length];
  return make(v.title, [v.part], `${card.position} at ${club}.`, `${ln}-variant`);
}

/** The club code used in stadium copy ("LIV"). */
export const clubCode = (t: PlayerCard['team']) => teamCode(t);
