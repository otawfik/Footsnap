/** Shared data hooks: one place that knows which request feeds which view. */
import { useMemo, useState, useEffect } from 'react';
import { useApi } from './useApi';
import { fetchScorers, fetchSeasonMatches, fetchStandings, fetchTeams } from '../services/api';
import { totalTable, splitMatches } from '../lib/football';
import { fit } from '../lib/model';
import { buildCards, PlayerCard } from '../lib/cards';
import { clubColors, ClubColors } from '../lib/colors';
import type { League } from '../constants/leagues';

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
  return useMemo(() => new Map((data?.teams ?? []).map((t) => [t.id, clubColors(t.clubColors)])), [data]);
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
