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
  const season = useSeason(league, poll ? 30_000 : null);
  const view = useMemo(() => splitMatches(season.data?.matches ?? [], Date.now(), 6, 8), [season.data]);
  const should = view.live.length > 0 || view.upcoming.some((m) => new Date(m.utcDate).getTime() - Date.now() < 15 * 60_000);
  useEffect(() => setPoll(should), [should]);
  return { ...season, view };
}

/** Every player card in the competition. */
export function useCards(league: League) {
  const teams = useTeams(league);
  const scorers = useScorers(league);
  const cards = useMemo(() => {
    if (!teams.data) return null;
    return buildCards(teams.data.teams, scorers.data?.scorers ?? [], league.name, league.nation);
  }, [teams.data, scorers.data, league.name, league.nation]);
  const list = useMemo(() => {
    if (!cards) return [] as PlayerCard[];
    const order = { icon: 0, elite: 1, rare: 2, common: 3 };
    return [...cards.values()].sort((a, b) => order[a.rarity] - order[b.rarity] || (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));
  }, [cards]);
  return {
    cards,
    list,
    loading: teams.loading && !teams.data,
    error: teams.error && !teams.data ? teams.error : null,
    errorCode: teams.errorCode,
    refetch: async () => {
      await Promise.all([teams.refetch(), scorers.refetch()]);
    },
  };
}
