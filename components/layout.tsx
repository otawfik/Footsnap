/**
 * Layout primitives for wide screens (docs/desktop/DESIGN.md; the rules live in lib/layout.ts).
 *
 * On the web these are plain Views tagged with a `data-fs` attribute; the stylesheet in
 * lib/layout.ts (SHELL_CSS) turns them into columns, rails and grids from 1024 px. Below that, and
 * on iOS and Android, they are the single column the app was drawn as.
 */
import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleProp, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useHydrated } from '../lib/hydration';
import { BP, contentWidth, mainWidth, Tier, tierOf } from '../lib/layout';

const WEB = Platform.OS === 'web';

/** `{...fs('page')}` tags a View for the stylesheet (web only; nothing on native). */
export function fs(name: string, hover?: 'lift' | 'row' | 'glow' | 'nav'): object {
  if (!WEB) return {};
  return { dataSet: hover ? { fs: name, 'fs-hover': hover } : { fs: name } };
}
/** A hover treatment alone. */
export const hover = (kind: 'lift' | 'row' | 'glow' | 'nav'): object => (WEB ? { dataSet: { 'fs-hover': kind } } : {});

export interface Breakpoint {
  tier: Tier;
  /** the window is at least 768 / 1024 / 1280 / 1600 wide */
  tablet: boolean;
  desktop: boolean;
  wide: boolean;
  xl: boolean;
  /** window width; 0 until hydrated on the web */
  width: number;
  height: number;
  /** width of the page's content box, and of its main column when the screen has a rail */
  content: number;
  main: number;
}

export function useBreakpoint(): Breakpoint {
  const win = useWindowDimensions();
  // The pre-rendered HTML knows no window size, and the first client render has to match it (or React
  // discards the page: error #418). So while a screen is hydrating it is told "phone", in the browser as
  // on the server; the real width arrives on the next render. Screens opened later (client navigation)
  // get it on their first render. Native has no pre-rendered HTML.
  const ready = useHydrated();
  // native builds are phone-only (app.json: supportsTablet false), and their layout never depended on width
  const width = WEB ? (ready ? win.width : 0) : Math.min(win.width, BP.tablet - 1);
  const height = ready ? win.height : 0;
  const tier = tierOf(width);
  return {
    tier,
    tablet: width >= BP.tablet,
    desktop: width >= BP.desktop,
    wide: width >= BP.wide,
    xl: width >= BP.xl,
    width,
    height,
    content: contentWidth(width || win.width),
    main: mainWidth(width || win.width),
  };
}

/** The measured width of a View: `const [w, onLayout] = useMeasure()`. 0 until laid out. */
export function useMeasure(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setW((cur) => (Math.abs(cur - next) >= 1 ? next : cur));
  }, []);
  return [w, onLayout];
}

type Box = { children?: React.ReactNode; style?: StyleProp<ViewStyle> };

/** Main column and right rail side by side from 1024 px; stacked (main first) below. */
export function Columns({ children, style }: Box) {
  return <View style={style} {...fs('columns')}>{children}</View>;
}

/** The main column of <Columns>. */
export function Main({ children, style }: Box) {
  return <View style={style} {...fs('main')}>{children}</View>;
}

/**
 * The right rail of <Columns>: context that a phone has no room for. It takes no space below
 * 1024 px, and its children should be rendered only when useBreakpoint().desktop is true, so a
 * phone never computes them. The track itself is always in the HTML, so the main column doesn't
 * jump when the rail's content arrives. `sticky` keeps it in view while the main column scrolls.
 */
export function Rail({ children, style, sticky }: Box & { sticky?: boolean }) {
  if (!WEB) return null;
  return <View style={style} {...fs(sticky ? 'rail sticky' : 'rail')}>{children}</View>;
}

/** Children laid out two across from 1024 px (three from 1600 with `xl3`); one per row below. */
export function Grid2({ children, style, xl3 }: Box & { xl3?: boolean }) {
  return <View style={style} {...fs(xl3 ? 'grid2 grid3-xl' : 'grid2')}>{children}</View>;
}

/** Shown from 1024 px only. For anything expensive, gate on useBreakpoint().desktop instead. */
export function DesktopOnly({ children, style }: Box) {
  if (!WEB) return null;
  return <View style={style} {...fs('desktop-only')}>{children}</View>;
}

/** Hidden from 1024 px. */
export function PhoneOnly({ children, style }: Box) {
  return <View style={style} {...fs('phone-only')}>{children}</View>;
}
