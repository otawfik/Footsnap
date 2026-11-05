/**
 * On-device state: the card collection, daily packs, picks, favourite teams and UI hints. AsyncStorage
 * (localStorage on the web). Nothing leaves the device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { UserPick } from './picks';
import type { CardState } from './collection';
import type { ClubColors } from './colors';
import { DeckSaves, migrateDeckSaves, NO_SAVES } from './decks';

const KEY = {
  collection: 'fs.collection.v3',
  packs: 'fs.packs.v1',
  picks: 'fs.picks.v1',
  profile: 'fs.profile.v1',
  favorites: 'fs.favorites.v1',
  seen: 'fs.seen.v1',
  // the version lives inside the value (DeckSaves.version), so old saves are migrated, not dropped
  decks: 'fs.decks',
};

async function read<T>(key: string, fallback: T, migrate?: (raw: unknown) => T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return migrate ? migrate(v) : (v as T);
  } catch {
    return fallback;
  }
}

async function write(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: the app keeps working, the change just isn't saved
  }
}

/** A tiny shared store per key, so every screen sees the same state. */
function makeStore<T>(key: string, initial: T, migrate?: (raw: unknown) => T) {
  let value = initial;
  let loaded = false;
  const subs = new Set<(v: T) => void>();
  const load = read<T>(key, initial, migrate).then((v) => {
    value = v;
    loaded = true;
    subs.forEach((s) => s(value));
  });
  return function useStore(): [T, (update: (v: T) => T) => void, boolean] {
    const [v, setV] = useState(value);
    const [ready, setReady] = useState(loaded);
    useEffect(() => {
      const sub = (nv: T) => {
        setV(nv);
        setReady(true);
      };
      subs.add(sub);
      load.then(() => sub(value));
      return () => {
        subs.delete(sub);
      };
    }, []);
    const update = useCallback((fn: (v: T) => T) => {
      const apply = () => {
        value = fn(value);
        subs.forEach((s) => s(value));
        write(key, value);
      };
      // an update before the saved value has loaded would be overwritten by it (and would
      // briefly write a reset value to disk), so queue it until the load finishes
      if (loaded) apply();
      else load.then(apply);
    }, []);
    return [v, update, ready];
  };
}

/** competition id → player id → card state (copies, boosters, tier, Premium) */
export const useCollection = makeStore<Record<string, Record<string, CardState>>>(KEY.collection, {});

export interface Profile {
  credits: number;
  /** Collection Level milestones already claimed */
  claimed: number[];
  /** match ids whose correct picks have already paid credits */
  creditedPicks: number[];
  /** guesses used today */
  guesses: { day: string; used: number; solved: number[] };
  /** unopened bonus packs from milestones */
  bonusPacks: number;
  /** bonus packs opened, ever (seeds each one differently) */
  bonusOpened?: number;
  /** Duel record */
  duel?: { played: number; won: number; drawn: number; best: number };
}

export const useProfile = makeStore<Profile>(KEY.profile, {
  credits: 100,
  claimed: [],
  creditedPicks: [],
  guesses: { day: '', used: 0, solved: [] },
  bonusPacks: 0,
});
/** competition id → day (YYYY-MM-DD) the pack was opened */
export const usePacks = makeStore<Record<string, string>>(KEY.packs, {});
/** match id → pick */
export const usePicks = makeStore<Record<string, UserPick>>(KEY.picks, {});

export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A followed club. Stored whole so Home can draw it before any data loads. */
export interface Favorite {
  competitionId: number;
  teamId: number;
  name: string;
  tla?: string;
  colors: ClubColors;
}

/** Favourite teams, in the order they were followed. */
export const useFavorites = makeStore<Favorite[]>(KEY.favorites, []);

export const isFavorite = (favs: Favorite[], teamId: number) => favs.some((f) => f.teamId === teamId);

/** Add the club if it isn't followed, remove it if it is. */
export const toggleFavorite = (favs: Favorite[], f: Favorite): Favorite[] =>
  isFavorite(favs, f.teamId) ? favs.filter((x) => x.teamId !== f.teamId) : [...favs, f];

/** One-off UI hints already shown ("Drag to tilt · Tap to flip"…): hint id → true. */
export const useSeen = makeStore<Record<string, boolean>>(KEY.seen, {});

/** The saved decks as stored, migrated to the current version: what useDeckSaves starts from. */
export const loadDeckSaves = () => read<DeckSaves>(KEY.decks, NO_SAVES, migrateDeckSaves);

/** Your Duel decks, per competition (lib/decks DeckSaves). */
export const useDeckSaves = makeStore<DeckSaves>(KEY.decks, NO_SAVES, migrateDeckSaves);
