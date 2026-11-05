/**
 * The Duel setup the lobby and the deck editor share: your deck for this competition
 * (the one you built, else the automatic one), and the next duel's three grounds.
 *
 * The grounds come from the next duel's seed (lib/decks nextDuelSeed), kept until a duel
 * starts, and lean towards the clubs in your collection rather than your deck, so editing
 * the deck never reshuffles the grounds you're building it for.
 */
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useCards, useTeams } from './data';
import { useCollection, useDeckSaves } from '../lib/storage';
import { autoIds, buildDeck, Deck, nextDuelSeed, resolveDeck } from '../lib/decks';
import { pickStadiums, Stadium, stadiumPool } from '../lib/stadiums';
import { hash } from '../lib/rng';
import type { League } from '../constants/leagues';
import type { PlayerCard } from '../lib/cards';

export interface DuelSetup {
  /** every card in the competition, and the ones you own */
  list: PlayerCard[];
  mine: PlayerCard[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** the deck you'll play (null while loading) */
  deck: Deck | null;
  /** true when it's one you built; false: the automatic deck */
  custom: boolean;
  /** the owned cards you picked (the automatic deck's when you haven't built one) */
  ids: number[];
  setIds: (ids: number[]) => void;
  /** Auto-fill: your picks become the automatic deck's */
  autoFill: () => void;
  /** the next duel */
  seed: number;
  grounds: Stadium[] | undefined;
}

export function useDuelSetup(league: League): DuelSetup {
  const { cards, list, loading, error, refetch } = useCards(league);
  const teams = useTeams(league);
  const [collection] = useCollection();
  const [saves, setSaves, savesReady] = useDeckSaves();
  const key = String(league.id);
  const owned = collection[key];
  const mine = useMemo(() => (owned ? list.filter((c) => owned[String(c.id)]) : []), [list, owned]);
  const deckSeed = hash(`deck:${league.id}`);
  const saved = saves.decks[key] ?? null;

  const deck = useMemo(() => {
    if (!cards || !savesReady) return null;
    return saved ? resolveDeck(saved.ids, mine, list, deckSeed) : buildDeck(mine, list, deckSeed);
  }, [cards, savesReady, saved, mine, list, deckSeed]);
  const ids = useMemo(() => (saved ? saved.ids : deck ? deck.cards.filter((c) => !deck.loans.has(c.id)).map((c) => c.id) : []), [saved, deck]);

  const setIds = useCallback((next: number[]) => setSaves((s) => ({ ...s, decks: { ...s.decks, [key]: { ids: next } } })), [setSaves, key]);
  const autoFill = useCallback(() => setIds(autoIds(mine, list, deckSeed)), [setIds, mine, list, deckSeed]);

  const pool = useMemo(() => stadiumPool(teams.data?.teams ?? []), [teams.data]);
  const [seed, setSeed] = useState(0);
  // read on every visit: the same seed until a duel uses it
  useFocusEffect(useCallback(() => setSeed(nextDuelSeed(league.id)), [league.id]));
  const grounds = useMemo(() => (seed && pool.length >= 3 ? pickStadiums(pool, [mine], seed) : undefined), [pool, mine, seed]);

  return { list, mine, loading, error, refetch, deck, custom: !!saved, ids, setIds, autoFill, seed, grounds };
}
