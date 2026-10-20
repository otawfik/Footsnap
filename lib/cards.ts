/**
 * Player cards, Snap-style: every player in a competition gets a card with a
 * rarity, a big number, and abilities. Nothing on a card is invented:
 *
 *   rarity   from the player's rank by goal contributions (goals × 2 + assists):
 *            top 3 Icon, 4-10 Elite, 11-20 Rare, everyone else Common
 *   number   Power = goals × 2 + assists for scorers; age for everyone else
 *   ability  a true statement computed from this season's numbers or from the
 *            squad lists (age, nationality, position), with the figures in it
 */
import type { Scorer, TeamDetail } from './types';
import { age as ageOf, line, Line } from './football';
import { clubColors, ClubColors } from './colors';

export type Rarity = 'icon' | 'elite' | 'rare' | 'common';
export const RARITY_ORDER: Rarity[] = ['icon', 'elite', 'rare', 'common'];
export const RARITY_NAME: Record<Rarity, string> = { icon: 'Icon', elite: 'Elite', rare: 'Rare', common: 'Common' };

export interface Ability {
  /** ongoing: from this season's numbers; trait: from who the player is */
  kind: 'ongoing' | 'trait';
  title: string;
  text: string;
}

export interface CardTeam {
  id: number;
  name: string;
  shortName: string;
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
      kind: 'ongoing',
      title: ctx.topGoalsCount > 1 ? 'Joint top scorer' : 'Golden Boot leader',
      text: `${ctx.topGoalsCount > 1 ? 'Joint top scorer in' : 'Leads'} the ${ctx.competition} with ${plural(g, 'goal')}.`,
    });
  }
  if (m && m >= 3 && g / m >= 0.75) {
    out.push({ kind: 'ongoing', title: 'Clinical', text: `${plural(g, 'goal')} in ${plural(m, 'game')}: ${(g / m).toFixed(2)} a game.` });
  }
  if (p !== null && p >= 2) {
    out.push({ kind: 'ongoing', title: 'Spot-kick specialist', text: `${p} of ${plural(g, 'goal')} from the penalty spot.` });
  }
  if (a !== null && a >= 3) {
    out.push({ kind: 'ongoing', title: 'Playmaker', text: `${plural(a, 'assist')} on top of ${plural(g, 'goal')}.` });
  }
  if (p === 0 && g >= 4) {
    out.push({ kind: 'ongoing', title: 'Open-play finisher', text: `All ${g} goals from open play.` });
  }
  if (!out.length && g > 0) {
    out.push({ kind: 'ongoing', title: 'Goal threat', text: `${plural(g, 'goal')}${m ? ` in ${plural(m, 'game')}` : ''} this season.` });
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
    out.push({ kind: 'trait', title: 'One of a kind', text: `The only player from ${nat} in the ${ctx.competition}.` });
  }
  if (p.age !== null && p.age <= 20) {
    const youngest = squad.ages.length > 1 && p.age === Math.min(...squad.ages);
    out.push({
      kind: 'trait',
      title: 'Wonderkid',
      text: youngest ? `${p.age} years old: the youngest in the ${squad.club} squad.` : `${p.age} years old: one of ${squad.u21} under-21s at ${squad.club}.`,
    });
  }
  if (p.age !== null && p.age >= 33) {
    const oldest = squad.ages.length > 1 && p.age === Math.max(...squad.ages);
    out.push({
      kind: 'trait',
      title: 'Veteran',
      text: oldest ? `${p.age}: the oldest player at ${squad.club}.` : `${p.age}: one of ${squad.over33} players aged 33+ at ${squad.club}.`,
    });
  }
  if (nat && nat !== ctx.nation && natCount > 1 && natCount <= 3) {
    out.push({ kind: 'trait', title: 'Rare passport', text: `One of ${natCount} players from ${nat} in the ${ctx.competition}.` });
  }
  if (nat && ctx.nation && nat === ctx.nation) {
    out.push({ kind: 'trait', title: 'Home-grown', text: `One of ${squad.fromNation} players from ${nat} in the ${squad.club} squad.` });
  }
  if (p.line === 'GK') {
    out.push({ kind: 'trait', title: 'Last line', text: `One of ${squad.keepers} goalkeepers at ${squad.club}.` });
  }
  if (!out.length) {
    out.push({ kind: 'trait', title: p.line ? LINE_NAME[p.line] : 'Squad player', text: `${p.position} at ${squad.club}${nat ? `, from ${nat}` : ''}.` });
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
    const t: CardTeam = { id: team.id, name: team.name, shortName: team.shortName ?? team.name, crest: team.crest, colors: clubColors(team.clubColors) };
    for (const p of squad) add(p, t, facts);
  }
  // scorers missing from the published squad lists still get a card
  for (const s of scorers) {
    if (cards.has(s.player.id)) continue;
    const t: CardTeam = { id: s.team.id, name: s.team.name, shortName: s.team.shortName ?? s.team.name, crest: s.team.crest, colors: clubColors(null) };
    add(s.player, t, { club: t.shortName, ages: [], keepers: 0, fromNation: 0, u21: 0, over33: 0 });
  }
  return cards;
}
