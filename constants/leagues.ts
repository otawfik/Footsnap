export interface League {
  id: number;
  /** short code for the league switcher */
  code: string;
  name: string;
  /** the country whose players count as home-grown on cards; none for the Champions League */
  nation?: string;
}

export const LEAGUES: League[] = [
  { id: 2021, code: 'PREMIER', name: 'Premier League', nation: 'England' },
  { id: 2014, code: 'LALIGA', name: 'La Liga', nation: 'Spain' },
  { id: 2002, code: 'BUNDES', name: 'Bundesliga', nation: 'Germany' },
  { id: 2019, code: 'SERIE A', name: 'Serie A', nation: 'Italy' },
  { id: 2015, code: 'LIGUE 1', name: 'Ligue 1', nation: 'France' },
  { id: 2001, code: 'UCL', name: 'Champions League' },
];

export const LEAGUE_MAP = Object.fromEntries(LEAGUES.map((l) => [l.id, l])) as Record<number, League>;
