/**
 * Player photos from Wikipedia, only when the article is about a footballer:
 * "<name> (footballer, born <year>)" when the birth year is known (shared names
 * like João Pedro use that form), then "<name> (footballer)", then the bare name; disambiguation pages and
 * articles whose short description isn't about football are rejected, so a
 * common name doesn't come back with a stranger's face. Cached per session.
 */
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

export interface Photo {
  src: string;
  href: string;
  aspect: number | null;
}

const cache = new Map<string, Promise<Photo | null>>();

async function summary(title: string) {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, {
      headers: { Accept: 'application/json' },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function find(name: string, born?: string | null): Promise<Photo | null> {
  const year = born?.slice(0, 4);
  const titles = [...(year ? [`${name} (footballer, born ${year})`] : []), `${name} (footballer)`, name];
  for (const title of titles) {
    const page = await summary(title);
    if (!page || page.type === 'disambiguation') continue;
    if (!/football|soccer/i.test(page.description ?? '')) continue;
    const src: string | undefined = page.thumbnail?.source;
    const href: string | undefined = page.content_urls?.mobile?.page ?? page.content_urls?.desktop?.page;
    if (!src || !href) return null;
    const w = page.thumbnail?.width;
    const h = page.thumbnail?.height;
    return { src, href, aspect: w && h ? w / h : null };
  }
  return null;
}

export function photoFor(name: string, born?: string | null) {
  if (!cache.has(name)) cache.set(name, find(name, born));
  return cache.get(name)!;
}

export function usePhoto(name: string, enabled = true, born?: string | null) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    setPhoto(null);
    setDone(false);
    if (!enabled) return;
    photoFor(name, born).then((p) => {
      if (!live) return;
      setPhoto(p);
      setDone(true);
      if (p && !p.aspect) Image.getSize(p.src, (w, h) => live && setPhoto({ ...p, aspect: w / h }), () => {});
    });
    return () => {
      live = false;
    };
  }, [name, enabled, born]);
  return { photo, done };
}
