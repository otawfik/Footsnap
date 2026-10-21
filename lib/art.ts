/**
 * Card art: player cut-outs (background removed) made by scripts/art from
 * Wikipedia / Wikimedia Commons photos, served as static files with the app at
 * /art/<playerId>.webp. index.json carries each image's credit and licence
 * (the cut-outs are edited versions of freely licensed photos, so every card
 * credits the photographer and links the original) and where the top of the
 * player's head sits, so the frame break can line up.
 */
import { useEffect, useState } from 'react';
import { BASE } from '../services/api';

export interface Art {
  src: string;
  /** 0-1 from the top of the image to the top of the head */
  headTop: number;
  artist: string;
  license: string;
  page: string;
}

type Index = Record<string, { headTop: number; artist: string; license: string; page: string }>;

let loaded: Promise<Index> | null = null;
function loadIndex(): Promise<Index> {
  if (!loaded) {
    loaded = fetch(`${BASE}/art/index.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    // a failed load shouldn't stick for the session
    loaded.then((i) => {
      if (!Object.keys(i).length) loaded = null;
    });
  }
  return loaded;
}

/**
 * Player photos can be switched off per build (EXPO_PUBLIC_SHOW_PHOTOS=false): the
 * Wikimedia licences cover the photographers' copyright, not the players' own
 * image rights, so the App Store build ships without them by default (eas.json)
 * and cards fall back to the club-colour shirt art.
 */
export const SHOW_PHOTOS = process.env.EXPO_PUBLIC_SHOW_PHOTOS !== 'false';

let snapshot: Index | null = null;

/** The art for a player, or null if there's no cut-out (the card then draws its kit art). */
export function useArt(playerId: number, enabled = true): Art | null {
  const [index, setIndex] = useState<Index | null>(snapshot);
  useEffect(() => {
    if (!SHOW_PHOTOS || !enabled || snapshot) return;
    let live = true;
    loadIndex().then((i) => {
      snapshot = Object.keys(i).length ? i : null;
      if (live) setIndex(i);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  const e = SHOW_PHOTOS ? index?.[String(playerId)] : undefined;
  return e ? { src: `${BASE}/art/${playerId}.webp`, ...e } : null;
}
