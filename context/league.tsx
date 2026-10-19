import React, { createContext, useContext, useState } from 'react';
import { LEAGUES, League } from '../constants/leagues';

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
