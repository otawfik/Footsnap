/*
 * FootSnap service worker: keeps the app shell so the installed app opens without a connection.
 *
 * What it caches
 *   - pages: every route's pre-rendered HTML, network first (a new deploy shows up on the next
 *     launch), with the copy from the last visit as the offline fallback. Dynamic routes
 *     (/card/123, /match/456, /club/57) share one copy each, since their HTML is the same template.
 *   - the bundle, fonts and images: their file names carry a content hash, so cache first. Bundles
 *     no cached page loads any more (an earlier deploy's) are dropped.
 *   - player art: the cached copy at once, refreshed in the background; the 300 most recent.
 *
 * What it never caches: the football data (/api/). Scores and tables always come from the network.
 * When there is none, the app falls back to its own saved copies and says so on screen ("Offline ·
 * showing data saved at 14:32", services/api.ts), so an old score is never passed off as live.
 */
const VERSION = 'v1';
const PAGES = `fs-pages-${VERSION}`;
const STATIC = `fs-static-${VERSION}`;
const ART = `fs-art-${VERSION}`;
const KEEP = [PAGES, STATIC, ART];

// the routes a first launch offline needs; dynamic ones are fetched as a sample id
const SHELL = ['/', '/matches', '/cards', '/play', '/model', '/about', '/card/0', '/match/0', '/club/0'];
const DYNAMIC = [
  [/^\/card\/[^/]+\/?$/, '/card/0'],
  [/^\/match\/[^/]+\/?$/, '/match/0'],
  [/^\/club\/[^/]+\/?$/, '/club/0'],
];

const pageKey = (pathname) => {
  for (const [re, key] of DYNAMIC) if (re.test(pathname)) return key;
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : '/';
};

/** Drop the oldest entries beyond `max` (art no longer looked at). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/** The hashed bundle, stylesheet and font files a page's HTML loads. */
const assetsIn = (html) => [...new Set([...html.matchAll(/(?:src|href)="(\/(?:_expo\/static|assets)\/[^"]+)"/g)].map((m) => m[1]))];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const htmls = await Promise.all(
        SHELL.map(async (url) => {
          const res = await fetch(url, { cache: 'reload' });
          if (!res.ok) throw new Error(`${url}: ${res.status}`);
          await pages.put(url, res.clone());
          return res.text();
        })
      );
      const assets = [...new Set(htmls.flatMap(assetsIn))];
      await (await caches.open(STATIC)).addAll(assets);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (!KEEP.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })()
  );
});

async function page(request) {
  const url = new URL(request.url);
  const key = pageKey(url.pathname);
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(key, res.clone());
      // a new deploy: keep the bundle it loads too, so the next offline launch has it
      const copy = await res.clone().text();
      const st = await caches.open(STATIC);
      await Promise.all(assetsIn(copy).map(async (a) => (await st.match(a)) || st.add(a).catch(() => {})));
      prune();
    }
    return res;
  } catch {
    return (await cache.match(key)) || (await cache.match('/')) || Response.error();
  }
}

/** Drop bundles that no cached page loads any more (from earlier deploys). */
async function prune() {
  const pages = await caches.open(PAGES);
  const used = new Set();
  for (const k of await pages.keys()) for (const a of assetsIn(await (await pages.match(k)).text())) used.add(a);
  const st = await caches.open(STATIC);
  for (const k of await st.keys()) {
    const path = new URL(k.url).pathname;
    if (path.startsWith('/_expo/static/') && !used.has(path)) await st.delete(k);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(event, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const fresh = fetch(event.request).then(async (res) => {
    if (res.ok) {
      await cache.put(event.request, res.clone());
      await trim(name, max);
    }
    return res;
  });
  if (hit) {
    event.waitUntil(fresh.catch(() => {}));
    return hit;
  }
  return fresh;
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // other origins (club crests) and the football data go straight to the network
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') return event.respondWith(page(request));
  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request));
  // the art index changes with each art run, so it goes with the network like any other file
  if (url.pathname.startsWith('/art/') && url.pathname !== '/art/index.json') return event.respondWith(staleWhileRevalidate(event, ART, 300));
  event.respondWith(networkFirst(request));
});
