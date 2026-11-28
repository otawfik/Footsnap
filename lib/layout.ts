/**
 * Layout rules for wide screens (docs/desktop/DESIGN.md). Pure, so they can be tested.
 *
 * The app was drawn for a phone. From 1024 px the web build gets a desktop shell: a sidebar instead
 * of the bottom tab bar, a centred page with a maximum width, and screens laid out in columns.
 * Everything that has to be right in the pre-rendered HTML (the shell, the page width, the column
 * tracks) is done with CSS media queries on `data-fs` attributes (SHELL_CSS below), because the
 * static export knows no window size and React throws the HTML away if the first client render
 * differs from it (error #418). Sizes that only JavaScript can compute (how wide a card or a chart
 * is) come from useBreakpoint() in components/layout.tsx, which reports "phone" until the page has
 * hydrated.
 */

/** Minimum window widths, in CSS px. */
export const BP = { tablet: 768, desktop: 1024, wide: 1280, xl: 1600 } as const;

export type Tier = 'phone' | 'tablet' | 'desktop' | 'wide' | 'xl';

export function tierOf(width: number): Tier {
  if (width >= BP.xl) return 'xl';
  if (width >= BP.wide) return 'wide';
  if (width >= BP.desktop) return 'desktop';
  if (width >= BP.tablet) return 'tablet';
  return 'phone';
}

/** The sidebar: icons only from 1024, icons and labels from 1280. */
export const SIDEBAR = { rail: 76, full: 248 } as const;
export const sidebarWidth = (width: number) => (width >= BP.wide ? SIDEBAR.full : width >= BP.desktop ? SIDEBAR.rail : 0);

/** The page: centred, never wider than this, with these side gutters. */
export const PAGE = { max: 1240, gutter: 20, gutterDesktop: 40, tabletMax: 760, railWidth: 340, railWidthXl: 380, columnGap: 40 } as const;

/** Side padding of the page at a window width. */
export const pageGutter = (width: number) => (width >= BP.desktop ? PAGE.gutterDesktop : PAGE.gutter);

/** Width of the page's content box (inside its gutters) at a window width. */
export function contentWidth(width: number): number {
  const room = width - sidebarWidth(width);
  const max = width >= BP.desktop ? PAGE.max : width >= BP.tablet ? PAGE.tabletMax : Infinity;
  return Math.max(0, Math.min(room, max) - pageGutter(width) * 2);
}

/** Width of the main column when a screen has a right rail (the rail only exists from `desktop`). */
export function mainWidth(width: number): number {
  const w = contentWidth(width);
  if (width < BP.desktop) return w;
  return w - PAGE.columnGap - (width >= BP.xl ? PAGE.railWidthXl : PAGE.railWidth);
}

/**
 * How many equal cells of at least `min` px fit in `avail` px with `gap` between them, and how wide
 * each then is (whole px, so a row never overflows). Never fewer than `minCols`, never more than `maxCols`.
 */
export function gridColumns(avail: number, min: number, gap: number, { minCols = 1, maxCols = Infinity }: { minCols?: number; maxCols?: number } = {}): { cols: number; cell: number } {
  const fit = Math.floor((avail + gap) / (min + gap));
  const cols = Math.max(minCols, Math.min(maxCols, fit));
  const cell = Math.max(0, Math.floor((avail - gap * (cols - 1)) / cols));
  return { cols, cell };
}

/** A chart's height from its width: `ratio` wide to 1 tall, clamped, so a wide column doesn't stretch it flat or tower. */
export const chartHeight = (width: number, ratio: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, width / ratio)));

/** Which sidebar item a path belongs to; pushed screens light up the section they were opened from. */
export type NavKey = 'home' | 'matches' | 'cards' | 'play' | 'beat' | 'model' | 'teams' | 'profile' | 'about';
export function navKey(pathname: string): NavKey {
  const p = pathname.replace(/^\/\(tabs\)/, '').replace(/\/+$/, '') || '/';
  if (p === '/matches' || p.startsWith('/match/') || p.startsWith('/club/')) return 'matches';
  if (p === '/cards' || p.startsWith('/card/') || p === '/pack' || p === '/guess') return 'cards';
  if (p === '/play' || p === '/deck' || p === '/arena') return 'play';
  if (p === '/beat') return 'beat';
  if (p === '/model') return 'model';
  if (p === '/teams') return 'teams';
  if (p === '/profile') return 'profile';
  if (p === '/about') return 'about';
  return 'home';
}

/** Screens that sit on top of another one; Esc closes them on the web. */
export const isDismissible = (pathname: string) => /^\/(card\/[^/]+|profile|teams|deck|pack|guess)$/.test(pathname.replace(/\/+$/, ''));

const ACCENT = '#4BD68C';

/**
 * The stylesheet behind every `data-fs` attribute (web only; injected once in app/+html.tsx).
 * react-native-web writes its own atomic classes, so the rules that change layout carry !important.
 */
export const SHELL_CSS = `
:root{color-scheme:dark}
[data-fs~="sidebar"],[data-fs~="rail"],[data-fs~="desktop-only"]{display:none!important}
[data-fs~="side-text"],[data-fs~="side-wide"]{display:none!important}
[role="button"]:focus-visible,[role="link"]:focus-visible,[role="tab"]:focus-visible,[role="radio"]:focus-visible,[role="switch"]:focus-visible,[role="checkbox"]:focus-visible,a:focus-visible,button:focus-visible,[tabindex="0"]:focus-visible{outline:2px solid ${ACCENT};outline-offset:2px;border-radius:8px}
@media (hover:hover) and (pointer:fine){
[data-fs-hover]{transition:transform .16s cubic-bezier(.2,0,0,1),background-color .12s,filter .12s,box-shadow .16s}
[data-fs-hover="lift"]:hover{transform:translateY(-5px)}
[data-fs-hover="row"]:hover{background-color:rgba(246,241,230,.055)}
[data-fs-hover="glow"]:hover{filter:brightness(1.12)}
[data-fs-hover="nav"]:hover{background-color:rgba(246,241,230,.07)}
}
@media (min-width:${BP.tablet}px){
[data-fs~="page"]{width:100%;max-width:${PAGE.tabletMax}px;margin-left:auto!important;margin-right:auto!important}
[data-fs~="sheet-wrap"]{justify-content:center!important;align-items:center!important}
[data-fs~="sheet"]{width:100%;max-width:460px;border-radius:24px!important;padding-bottom:20px!important;box-shadow:0 24px 80px rgba(0,0,0,.5)}
[data-fs~="grabber"]{display:none!important}
}
@media (min-width:${BP.desktop}px){
[data-fs~="sidebar"]{display:flex!important;width:${SIDEBAR.rail}px}
[data-fs~="tabbar"],[data-fs~="phone-only"]{display:none!important}
[data-fs~="desktop-only"]{display:flex!important}
[data-fs~="page"]{max-width:${PAGE.max}px;padding-left:${PAGE.gutterDesktop - PAGE.gutter}px;padding-right:${PAGE.gutterDesktop - PAGE.gutter}px;padding-top:12px}
[data-fs~="page-narrow"]{max-width:${PAGE.tabletMax + 80}px}
[data-fs~="columns"]{flex-direction:row!important;align-items:flex-start!important;gap:${PAGE.columnGap}px}
[data-fs~="main"]{flex:1 1 0%!important;min-width:0}
[data-fs~="rail"]{display:flex!important;flex:none;width:${PAGE.railWidth}px;gap:20px}
[data-fs~="sticky"]{position:sticky!important;top:16px}
[data-fs~="grid2"]{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px;row-gap:16px;align-items:start}
[data-fs~="nav-title"]{text-align:left!important;font-size:14px!important}
[data-fs~="scroll"]{scrollbar-width:thin!important;scrollbar-color:#35507F transparent}
[data-fs~="scroll"]::-webkit-scrollbar{display:block!important;width:10px}
[data-fs~="scroll"]::-webkit-scrollbar-thumb{background:#253C68;border-radius:5px;border:2px solid #102040}
[data-fs~="prose"]{max-width:68ch}
}
@media (min-width:${BP.wide}px){
[data-fs~="sidebar"]{width:${SIDEBAR.full}px}
[data-fs~="side-text"]{display:inline!important}
[data-fs~="side-wide"]{display:flex!important}
[data-fs~="side-narrow"]{display:none!important}
[data-fs~="side-item"]{flex-direction:row!important;justify-content:flex-start!important;gap:14px!important;min-height:42px!important;padding:0 12px!important}
}
@media (min-width:${BP.xl}px){
[data-fs~="rail"]{width:${PAGE.railWidthXl}px}
[data-fs~="grid3-xl"]{grid-template-columns:repeat(3,minmax(0,1fr))}
}
`.replace(/\n/g, '');
