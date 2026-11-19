import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { LEAGUES, LEAGUE_MAP, League } from '../constants/leagues';

/** The selected competition, shared by every tab so switching tabs keeps your league. */
const LeagueContext = createContext<{ league: League; setLeague: (l: League) => void }>({
  league: LEAGUES[0],
  setLeague: () => {},
});

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [league, setLeague] = useState<League>(LEAGUES[0]);
  return <LeagueContext.Provider value={{ league, setLeague }}>{children}</LeagueContext.Provider>;
}

export const useLeague = () => useContext(LeagueContext);

/**
 * The competition a link names (`?c=2001` on match and club pages), else the selected one. On the
 * web the page is pre-rendered without its query string, and the first render has to match that
 * HTML (or React discards it, error #418), so the link's competition takes over one render later.
 */
export function useLinkedLeague(c?: string): League {
  const ctx = useLeague();
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');
  useEffect(() => setHydrated(true), []);
  return (hydrated && c && LEAGUE_MAP[Number(c)]) || ctx.league;
}
