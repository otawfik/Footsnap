/** Shared data hooks: one place that knows which request feeds which view. */
import { useMemo, useState, useEffect } from 'react';
import { useApi } from './useApi';
import { fetchScorers, fetchSeasonMatches, fetchStandings, fetchTeams } from '../services/api';
import { totalTable, splitMatches, isLive, isUpcoming, isFinished } from '../lib/football';
import { fit, outcome, predict, Prediction, Ratings } from '../lib/model';
import { buildCards, PlayerCard } from '../lib/cards';
import { clubColors, ClubColors } from '../lib/colors';
import { REWARDS } from '../lib/collection';
import { usePicks, useProfile, type Favorite } from '../lib/storage';
import type { League } from '../constants/leagues';
import type { Match, TeamDetail } from '../lib/types';

export function useSeason(league: League, pollMs: number | null = null) {
  return useApi((force) => fetchSeasonMatches(league.id, force), [league.id], { pollMs });
}

export function useTable(league: League) {
  const q = useApi((force) => fetchStandings(league.id, force), [league.id]);
  return { ...q, table: totalTable(q.data) };
}

export function useTeams(league: League) {
  return useApi((force) => fetchTeams(league.id, force), [league.id]);
}

export function useScorers(league: League) {
  return useApi((force) => fetchScorers(league.id, force), [league.id]);
}

/** Club colours by team id for the selected competition (from the squads request). */
export function useClubColors(league: League): Map<number, ClubColors> {
  const { data } = useTeams(league);
  return useMemo(() => new Map((data?.teams ?? []).map((t) => [t.id, clubColors(t.clubColors, t.id)])), [data]);
}

export function useRatings(league: League) {
  const season = useSeason(league);
  const ratings = useMemo(() => fit(season.data?.matches ?? []), [season.data]);
  return { ...season, ratings };
}

/** Live polling for the matchday screen: every 30s only while something is live or about to start. */
export function useLiveSeason(league: League) {
  const [poll, setPoll] = useState(false);
  // a clock tick, so a kick-off that arrives while the screen is open starts the polling
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const season = useSeason(league, poll ? 30_000 : null);
  const view = useMemo(() => splitMatches(season.data?.matches ?? [], now, 6, 8), [season.data, now]);
  const should = view.live.length > 0 || view.upcoming.some((m) => new Date(m.utcDate).getTime() - now < 15 * 60_000);
  useEffect(() => setPoll(should), [should]);
  return { ...season, view };
}

/**
 * Every player card in the competition. Cards wait for both the squads and the
 * scorers: without the scorers list every rarity and stat line would be wrong,
 * and packs opened then would be all Commons.
 */
export function useCards(league: League) {
  const teams = useTeams(league);
  const scorers = useScorers(league);
  const cards = useMemo(() => {
    if (!teams.data || !scorers.data) return null;
    return buildCards(teams.data.teams, scorers.data.scorers ?? [], league.name, league.nation);
  }, [teams.data, scorers.data, league.name, league.nation]);
  const list = useMemo(() => {
    if (!cards) return [] as PlayerCard[];
    const order = { icon: 0, elite: 1, rare: 2, common: 3 };
    return [...cards.values()].sort((a, b) => order[a.rarity] - order[b.rarity] || (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));
  }, [cards]);
  const failed = (q: { error: string | null; data: unknown }) => !!q.error && !q.data;
  return {
    cards,
    list,
    loading: !cards && !failed(teams) && !failed(scorers),
    error: failed(teams) ? teams.error : failed(scorers) ? scorers.error : null,
    errorCode: failed(teams) ? teams.errorCode : scorers.errorCode,
    refetch: async () => {
      await Promise.all([teams.refetch(), scorers.refetch()]);
    },
  };
}

/** A season's fixtures and squads for one competition, plus what Home derives from them. */
export interface CompetitionData {
  competitionId: number;
  matches: Match[];
  teams: TeamDetail[];
  ratings: Ratings | null;
  colors: Map<number, ClubColors>;
  venues: Map<number, string>;
}

export interface HomeFixture {
  match: Match;
  competitionId: number;
  prediction: Prediction | null;
  venue?: string;
  homeColors?: ClubColors;
  awayColors?: ClubColors;
}

/**
 * Home's "Your teams": the next (or live) fixture of every favourite, across competitions,
 * soonest first, at most `limit`. One season + one squads request per distinct competition
 * (≤ 6, edge-cached), polled every 30 s only while one of them is live or about to start.
 */
export function useHomeFixtures(favorites: Favorite[], limit = 3) {
  const comps = useMemo(() => [...new Set(favorites.map((f) => f.competitionId))].sort((a, b) => a - b), [favorites]);
  const [poll, setPoll] = useState(false);
  const q = useApi(
    (force) =>
      Promise.all(
        comps.map(async (id) => {
          const [season, teams] = await Promise.all([fetchSeasonMatches(id, force), fetchTeams(id, force).catch(() => null)]);
          return { id, matches: season.matches, teams: teams?.teams ?? [] };
        })
      ),
    [comps.join(',')],
    { pollMs: poll ? 30_000 : null }
  );
  const data = useMemo<CompetitionData[]>(
    () =>
      (q.data ?? []).map((c) => ({
        competitionId: c.id,
        matches: c.matches,
        teams: c.teams,
        ratings: fit(c.matches),
        colors: new Map(c.teams.map((t) => [t.id, clubColors(t.clubColors, t.id)])),
        venues: new Map(c.teams.filter((t) => t.venue).map((t) => [t.id, t.venue as string])),
      })),
    [q.data]
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const fixtures = useMemo(() => {
    const out: HomeFixture[] = [];
    const seen = new Set<number>();
    for (const f of favorites) {
      const c = data.find((d) => d.competitionId === f.competitionId);
      if (!c) continue;
      const next = c.matches
        .filter((m) => (isLive(m) || isUpcoming(m)) && (m.homeTeam.id === f.teamId || m.awayTeam.id === f.teamId))
        .sort((a, b) => a.utcDate.localeCompare(b.utcDate))[0];
      if (!next || seen.has(next.id)) continue;
      seen.add(next.id);
      out.push({
        match: next,
        competitionId: c.competitionId,
        prediction: c.ratings ? predict(c.ratings, next.homeTeam.id, next.awayTeam.id) : null,
        venue: c.venues.get(next.homeTeam.id),
        homeColors: c.colors.get(next.homeTeam.id),
        awayColors: c.colors.get(next.awayTeam.id),
      });
    }
    return out.sort((a, b) => a.match.utcDate.localeCompare(b.match.utcDate)).slice(0, limit);
  }, [favorites, data, limit]);
  const live = useMemo(() => data.flatMap((c) => c.matches.filter(isLive).map((m) => ({ match: m, competitionId: c.competitionId, colors: c.colors }))), [data]);
  const should = live.length > 0 || fixtures.some((f) => new Date(f.match.utcDate).getTime() - now < 15 * 60_000);
  useEffect(() => setPoll(should), [should]);
  return { ...q, data, fixtures, live, loading: q.loading && comps.length > 0 };
}

/** The matchday that's on now: the one of the earliest fixture still to finish (live or to come). */
export function currentMatchday(matches: Match[]): number | null {
  const open = matches.filter((m) => (isLive(m) || isUpcoming(m)) && m.matchday).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  if (open.length) return open[0].matchday as number;
  const done = matches.filter((m) => isFinished(m) && m.matchday).map((m) => m.matchday as number);
  return done.length ? Math.max(...done) : null;
}

/** Right picks pay credits once each (+10, +20 if Pressed). Call from any screen that shows picks. */
export function useSettlePicks(matches: Match[]) {
  const [picks] = usePicks();
  const [profile, setProfile, ready] = useProfile();
  useEffect(() => {
    if (!ready || !matches.length) return;
    const byId = new Map(matches.map((m) => [m.id, m]));
    const due = Object.values(picks).filter((p) => {
      const m = byId.get(p.matchId);
      return m && isFinished(m) && p.outcome === outcome(m) && !profile.creditedPicks.includes(m.id);
    });
    if (!due.length) return;
    setProfile((pr) => {
      const fresh = due.filter((p) => !pr.creditedPicks.includes(p.matchId));
      if (!fresh.length) return pr;
      return {
        ...pr,
        credits: pr.credits + fresh.reduce((s, p) => s + REWARDS.pickRight * (p.snapped ? 2 : 1), 0),
        creditedPicks: [...pr.creditedPicks, ...fresh.map((p) => p.matchId)],
      };
    });
  }, [picks, matches, profile.creditedPicks, ready, setProfile]);
}
