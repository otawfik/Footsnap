/**
 * Player cards, Snap-style: every player in a competition gets a card with a
 * rarity, a big number, and abilities. Nothing on a card is invented:
 *
 *   rarity   from the player's rank by goal contributions (goals × 2 + assists)
 *            among the competition's top 20 scorers (the scorers list the data
 *            provides): top 3 Icon, 4-10 Elite, 11-20 Rare, everyone else Common
 *   number   Power = goals × 2 + assists for scorers; age for everyone else
 *   ability  a true statement computed from this season's numbers or from the
 *            squad lists (age, nationality, position), with the figures in it
 */
import type { Scorer, TeamDetail } from './types';
import { age as ageOf, line, Line } from './football';
import { clubColors, ClubColors } from './colors';

export type Rarity = 'icon' | 'elite' | 'rare' | 'common';
export const RARITY_ORDER: Rarity[] = ['icon', 'elite', 'rare', 'common'];
/** Rarities are shown as the card's metal (constants/design.ts METAL_NAME). */
export const RARITY_NAME: Record<Rarity, string> = { icon: 'Icon', elite: 'Gold', rare: 'Silver', common: 'Bronze' };

export interface Ability {
  /** stable id; game effects map from this, so rewording a title can't change a card's effect */
  key?: string;
  /** ongoing: from this season's numbers; trait: from who the player is */
  kind: 'ongoing' | 'trait';
  title: string;
  text: string;
}

export interface CardTeam {
  id: number;
  name: string;
  shortName: string;
  /** three-letter club code ("MCI"): football-data's tla, else the short name's first three letters.
   * Always set by buildCards; optional so hand-built test cards stay valid (read it through teamCode). */
  tla?: string;
  crest?: string;
  colors: ClubColors;
}

export interface PlayerCard {
  id: number;
  name: string;
  /** the name for the card's banner */
  banner: string;
  line: Line | null;
  position: string;
  age: number | null;
  dateOfBirth: string | null;
  nationality: string | null;
  team: CardTeam;
  rarity: Rarity;
  /** rank by goal contributions among the competition's top scorers, if listed */
  rank: number | null;
  stats: { goals: number; assists: number | null; penalties: number | null; played: number | null } | null;
  power: number | null;
  abilities: Ability[];
}

const LINE_NAME: Record<Line, string> = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };
// football-data.org's coarse positions read oddly on a card ("Offence"); fine ones ("Left-Back") pass through
const COARSE: Record<string, string> = { Offence: 'Forward', Defence: 'Defender', Midfield: 'Midfielder' };
export const positionName = (p: string | null | undefined, l: Line | null) => (p ? COARSE[p] ?? p : l ? LINE_NAME[l] : 'Player');

export const contribution = (s: Scorer) => s.goals * 2 + (s.assists ?? 0);

export function rarityForRank(rank: number | null): Rarity {
  if (rank === null) return 'common';
  if (rank <= 3) return 'icon';
  if (rank <= 10) return 'elite';
  if (rank <= 20) return 'rare';
  return 'common';
}

export function bannerName(name: string, max = 13): string {
  if (name.length <= max) return name;
  const parts = name.split(' ');
  if (parts.length < 2) return name;
  const rest = parts.slice(1).join(' ');
  return rest.length <= max ? rest : parts[parts.length - 1];
}

/** The club code a card prints: the data's tla, else the first three letters of the short name. */
export function teamCode(t: { tla?: string | null; shortName?: string | null; name: string }): string {
  if (t.tla && /^[A-Za-z0-9]{2,4}$/.test(t.tla)) return t.tla.toUpperCase();
  const letters = (t.shortName ?? t.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 3).toUpperCase();
}

// name particles that belong to the surname ("van Dijk", "De Bruyne", "Mac Allister")
const PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'der', 'den', 'di', 'da', 'das', 'do', 'dos', 'du', 'le', 'la', 'mac', 'mc', 'el', 'al', 'ten', 'ter', 'st.', 'saint', 'ben', 'bin', 'ibn', 'abu']);
const SUFFIXES = new Set(['junior', 'júnior', 'jr', 'jr.', 'filho', 'neto', 'sobrinho', 'ii', 'iii']);

/**
 * The name on the front of the card, the way FUT prints it: the surname ("Haaland", "Saka"), with its
 * particles ("van Dijk") and with a suffix kept on the word before it ("Vinícius Júnior"). One-word names
 * pass through. The full name is on the back and in the card view.
 */
export function faceName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  let i = parts.length - 1;
  if (SUFFIXES.has(parts[i].toLowerCase()) && i > 0) i -= 1;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i -= 1;
  // a particle as the first word is a surname on its own ("De Ligt" stays "De Ligt")
  if (i === 1 && PARTICLES.has(parts[0].toLowerCase())) i = 0;
  return parts.slice(i).join(' ');
}

/** The first letter of the face name, as the photos-off medallion sets it (keeps Ø, Ö, É). */
export function initialOf(name: string): string {
  const surname = faceName(name).split(' ').filter((w) => !PARTICLES.has(w.toLowerCase()));
  const word = surname[0] ?? name;
  return [...word][0]?.toUpperCase() ?? '?';
}

/** "26/27": European seasons start in July or August, so before July it's the season that began last year. */
export function seasonLabel(now = new Date()): string {
  const y = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
  return `${String(y % 100).padStart(2, '0')}/${String((y + 1) % 100).padStart(2, '0')}`;
}

export interface StatSlot {
  value: string;
  label: string;
}

/**
 * The stats row on the card face: goals, assists (or goals per game when the data has no assists),
 * appearances, age. Only numbers the data actually holds: a missing one drops its slot rather than
 * printing a 0. Null when the player isn't among the top scorers (the card shows a trait instead).
 */
export function faceStats(card: Pick<PlayerCard, 'stats' | 'age'>): StatSlot[] | null {
  const s = card.stats;
  if (!s) return null;
  const out: StatSlot[] = [{ value: String(s.goals), label: 'GLS' }];
  if (s.assists !== null) out.push({ value: String(s.assists), label: 'AST' });
  else if (s.played) out.push({ value: (s.goals / s.played).toFixed(2), label: 'G/GM' });
  if (s.played !== null) out.push({ value: String(s.played), label: 'APP' });
  if (card.age !== null) out.push({ value: String(card.age), label: 'AGE' });
  if (out.length < 4 && s.penalties !== null) out.splice(1, 0, { value: String(s.penalties), label: 'PEN' });
  return out.slice(0, 4);
}

/**
 * How a card's Duel numbers come out of the data, in two lines (the rules live in lib/game.ts:
 * cost by rarity, then the cost's base Power plus 1 per 4 goals, capped).
 */
export function explainStats(card: Pick<PlayerCard, 'rarity' | 'rank' | 'line' | 'stats'>, cost: number, power: number, goalBonusCap = 3): [string, string] {
  const why =
    card.rarity === 'icon'
      ? 'Icon rarity'
      : card.rarity === 'elite'
      ? card.rank !== null && card.rank <= 6
        ? `Gold rarity, #${card.rank} of the top scorers`
        : 'Gold rarity'
      : card.rarity === 'rare'
      ? 'Silver rarity'
      : card.line === 'DF' || card.line === 'GK'
      ? `Bronze ${card.line === 'GK' ? 'goalkeeper' : 'defender'}`
      : 'Bronze rarity';
  const goals = card.stats?.goals ?? 0;
  const bonus = card.stats ? Math.min(goalBonusCap, Math.floor(goals / 4)) : 0;
  const base = power - bonus;
  const tail = bonus
    ? ` + ${bonus} for ${plural(goals, 'goal')} (1 per 4${goals >= goalBonusCap * 4 ? `, max ${goalBonusCap}` : ''}).`
    : card.stats
    ? `. ${plural(goals, 'goal')}: the bonus starts at 4.`
    : '. No league goals listed, so no goal bonus.';
  return [`Cost ${cost}: ${why}.`, `Power ${power}: ${base} for cost ${cost}${tail}`];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Context {
  competition: string;
  nation?: string;
  nationCount: Map<string, number>;
  topGoals: number;
  topGoalsCount: number;
  now: Date;
}

/** Stat abilities, best first. */
export function statAbilities(s: NonNullable<PlayerCard['stats']>, ctx: Pick<Context, 'competition' | 'topGoals' | 'topGoalsCount'>): Ability[] {
  const out: Ability[] = [];
  const { goals: g, assists: a, penalties: p, played: m } = s;
  if (g > 0 && g === ctx.topGoals) {
    out.push({
      key: 'top-scorer',
      kind: 'ongoing',
      title: ctx.topGoalsCount > 1 ? 'Joint top scorer' : 'Golden Boot leader',
      text: `${ctx.topGoalsCount > 1 ? 'Joint top scorer in' : 'Leads'} the ${ctx.competition} with ${plural(g, 'goal')}.`,
    });
  }
  if (m && m >= 3 && g / m >= 0.75) {
    out.push({ key: 'clinical', kind: 'ongoing', title: 'Clinical', text: `${plural(g, 'goal')} in ${plural(m, 'game')}: ${(g / m).toFixed(2)} a game.` });
  }
  if (p !== null && p >= 2) {
    out.push({ key: 'penalties', kind: 'ongoing', title: 'Spot-kick specialist', text: `${p} of ${plural(g, 'goal')} from the penalty spot.` });
  }
  if (a !== null && a >= 3) {
    out.push({ key: 'playmaker', kind: 'ongoing', title: 'Playmaker', text: `${plural(a, 'assist')} on top of ${plural(g, 'goal')}.` });
  }
  if (p === 0 && g >= 4) {
    out.push({ key: 'open-play', kind: 'ongoing', title: 'Open-play finisher', text: `All ${g} goals from open play.` });
  }
  if (!out.length && g > 0) {
    out.push({ key: 'goal-threat', kind: 'ongoing', title: 'Goal threat', text: `${plural(g, 'goal')}${m ? ` in ${plural(m, 'game')}` : ''} this season.` });
  }
  return out;
}

interface SquadFacts {
  club: string;
  ages: number[];
  keepers: number;
  fromNation: number;
  u21: number;
  over33: number;
}

/** Trait abilities from squad facts, best first. */
export function traitAbilities(
  p: { age: number | null; nationality: string | null; line: Line | null; position: string },
  squad: SquadFacts,
  ctx: Pick<Context, 'competition' | 'nation' | 'nationCount'>
): Ability[] {
  const out: Ability[] = [];
  const nat = p.nationality;
  const natCount = nat ? ctx.nationCount.get(nat) ?? 0 : 0;
  if (nat && nat !== ctx.nation && natCount === 1) {
    out.push({ key: 'one-of-a-kind', kind: 'trait', title: 'One of a kind', text: `The only player from ${nat} in the ${ctx.competition}.` });
  }
  if (p.age !== null && p.age <= 20) {
    const youngest = squad.ages.length > 1 && p.age === Math.min(...squad.ages);
    const same = squad.ages.filter((x) => x === p.age).length;
    out.push({
      key: 'wonderkid',
      kind: 'trait',
      title: 'Wonderkid',
      text: youngest
        ? `${p.age} years old: ${same > 1 ? 'joint youngest' : 'the youngest'} in the ${squad.club} squad.`
        : `${p.age} years old: one of ${squad.u21} under-21s at ${squad.club}.`,
    });
  }
  if (p.age !== null && p.age >= 33) {
    const oldest = squad.ages.length > 1 && p.age === Math.max(...squad.ages);
    const same = squad.ages.filter((x) => x === p.age).length;
    out.push({
      key: 'veteran',
      kind: 'trait',
      title: 'Veteran',
      text: oldest
        ? `${p.age}: ${same > 1 ? 'joint oldest' : 'the oldest'} player at ${squad.club}.`
        : `${p.age}: one of ${squad.over33} players aged 33+ at ${squad.club}.`,
    });
  }
  if (nat && nat !== ctx.nation && natCount > 1 && natCount <= 3) {
    out.push({ key: 'rare-passport', kind: 'trait', title: 'Rare passport', text: `One of ${natCount} players from ${nat} in the ${ctx.competition}.` });
  }
  if (nat && ctx.nation && nat === ctx.nation) {
    out.push({ key: 'home-nation', kind: 'trait', title: 'Home nation', text: `One of ${squad.fromNation} players from ${nat} in the ${squad.club} squad.` });
  }
  if (p.line === 'GK') {
    out.push({ key: 'keeper', kind: 'trait', title: 'Last line', text: `One of ${squad.keepers} goalkeepers at ${squad.club}.` });
  }
  if (!out.length) {
    out.push({ key: `role-${p.line ?? 'none'}`, kind: 'trait', title: p.line ? LINE_NAME[p.line] : 'Squad player', text: `${p.position} at ${squad.club}${nat ? `, from ${nat}` : ''}.` });
  }
  return out;
}

/** Every card for one competition, keyed by player id. */
export function buildCards(
  teams: TeamDetail[],
  scorers: Scorer[],
  competition: string,
  nation?: string,
  now = new Date()
): Map<number, PlayerCard> {
  const ranked = scorers.slice().sort((a, b) => contribution(b) - contribution(a) || b.goals - a.goals);
  const rankOf = new Map(ranked.map((s, i) => [s.player.id, i + 1]));
  const statsOf = new Map(scorers.map((s) => [s.player.id, s]));
  const topGoals = Math.max(0, ...scorers.map((s) => s.goals));
  const topGoalsCount = scorers.filter((s) => s.goals === topGoals).length;

  const nationCount = new Map<string, number>();
  for (const t of teams) for (const p of t.squad ?? []) if (p.nationality) nationCount.set(p.nationality, (nationCount.get(p.nationality) ?? 0) + 1);
  const ctx: Context = { competition, nation, nationCount, topGoals, topGoalsCount, now };

  const cards = new Map<number, PlayerCard>();
  const add = (
    p: { id: number; name: string; position?: string | null; dateOfBirth?: string | null; nationality?: string | null },
    t: CardTeam,
    squad: SquadFacts
  ) => {
    const s = statsOf.get(p.id);
    const rank = rankOf.get(p.id) ?? null;
    const l = line(p.position);
    const a = ageOf(p.dateOfBirth, now);
    const stats = s ? { goals: s.goals, assists: s.assists, penalties: s.penalties, played: s.playedMatches ?? null } : null;
    const facts = { age: a, nationality: p.nationality ?? null, line: l, position: positionName(p.position, l) };
    const abilities = [
      ...(stats ? statAbilities(stats, ctx).slice(0, 1) : []),
      ...traitAbilities(facts, squad, ctx),
    ].slice(0, 2);
    cards.set(p.id, {
      id: p.id,
      name: p.name,
      banner: bannerName(p.name),
      line: l,
      position: facts.position,
      age: a,
      dateOfBirth: p.dateOfBirth ?? null,
      nationality: facts.nationality,
      team: t,
      rarity: rarityForRank(rank),
      rank,
      stats,
      power: s ? contribution(s) : null,
      abilities,
    });
  };

  for (const team of teams) {
    const squad = team.squad ?? [];
    const ages = squad.map((p) => ageOf(p.dateOfBirth, now)).filter((x): x is number => x !== null);
    const facts: SquadFacts = {
      club: team.shortName ?? team.name,
      ages,
      keepers: squad.filter((p) => line(p.position) === 'GK').length,
      fromNation: nation ? squad.filter((p) => p.nationality === nation).length : 0,
      u21: ages.filter((x) => x <= 20).length,
      over33: ages.filter((x) => x >= 33).length,
    };
    const t: CardTeam = { id: team.id, name: team.name, shortName: team.shortName ?? team.name, tla: teamCode(team), crest: team.crest, colors: clubColors(team.clubColors) };
    for (const p of squad) add(p, t, facts);
  }
  // scorers missing from the published squad lists still get a card
  for (const s of scorers) {
    if (cards.has(s.player.id)) continue;
    const t: CardTeam = { id: s.team.id, name: s.team.name, shortName: s.team.shortName ?? s.team.name, tla: teamCode(s.team), crest: s.team.crest, colors: clubColors(null) };
    add(s.player, t, { club: t.shortName, ages: [], keepers: 0, fromNation: 0, u21: 0, over33: 0 });
  }
  return cards;
}
