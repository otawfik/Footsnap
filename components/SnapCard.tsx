/**
 * The player card (SPEC.md §6): a FUT-grade metal collectible.
 *
 *   - crest-cut silhouette (chamfered top, shallow shield point), a 7-stop metal rim per rarity
 *     (Bronze, Silver, Gold, Icon pearl) and an obsidian Legend frame for tier 6
 *   - a club-colour field lit behind the head (components/card/metals.ts), darkened only as far as
 *     the text needs; every cut-out is framed the same way; not-owned cards stay in full colour
 *   - FUT type top-left (Power, position, nation, club), the Snap cost gem top-right,
 *     a real-stats row along the bottom (never a 0 the data doesn't hold)
 *   - photos off (the store build): the club kit as a diagonal sash and an engraved metal
 *     medallion with the surname's initial, a first-class face, not a fallback
 *
 * Everything is drawn in one react-native-svg tree, in card-width percent units (u). The grid
 * card is static (no animation loop per card); only the full card animates its sheen and tilt.
 */
import React, { useEffect, useId, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, FeColorMatrix, FeGaussianBlur, Filter, G, Image as SvgImage, LinearGradient as LG, Mask, Path, RadialGradient as RG, Rect, Circle, Stop, Text as SvgText } from 'react-native-svg';
import { DeviceMotion } from 'expo-sensors';
import type { PlayerCard } from '../lib/cards';
import { RARITY_NAME, explainStats, faceName, faceStats, initialOf, seasonLabel, teamCode } from '../lib/cards';
import type { Finish, Tier } from '../lib/collection';
import { FINISH_NAME } from '../lib/collection';
import { cardStats, GOAL_BONUS_CAP } from '../lib/game';
import { nationCode } from '../lib/nations';
import { useArt, type Art } from '../lib/art';
import { CARD, CARD_RATIO, cardPath, color, font, gem, metal, motion, type Metal } from '../constants/design';
import { cardMetal, clubField } from './card/metals';
import { luminance, mix } from '../lib/colors';

// retired v1 pieces, re-exported until guess.tsx / arena.tsx stop importing them (SPEC §6)
export { KitArt, Badges, RARITY_FRAME, FRAME_START, FRAME_END, frameOf, emWidth } from './card/legacy';

export type CardSize = 'full' | 'grid' | 'hand' | 'board';
type LegacySize = 'sm' | 'md' | 'lg';

export const cardHeight = (w: number) => Math.round(w * CARD_RATIO);

export interface Look {
  tier: Tier;
  finish: Finish | null;
  premium: boolean;
}
export const BASE_LOOK: Look = { tier: 0, finish: null, premium: false };

/** The head breaks the frame at full size only (tier ≥ 1, Icon, Gold). */
export const breaksFrame = (card: PlayerCard, look: Look) => look.tier >= 1 || card.rarity === 'icon' || card.rarity === 'elite';

const SHOW_CRESTS = process.env.EXPO_PUBLIC_SHOW_CRESTS !== 'false';
const LINE_CODE = { FW: 'FWD', MF: 'MID', DF: 'DEF', GK: 'GK' } as const;
// local tokens (not in design.ts): the duel's unaffordable gem, the uncollected dimmer
const GEM_OFF = { hi: '#8A8F9A', mid: '#6A6F7A', low: '#3D414A', edge: '#25282E' };
// not owned: a light shade over full colour (the collection should look like a catalogue, not a graveyard)
const UNOWNED = 'rgba(8,8,10,0.24)';

/** Inter Tight 800 advances (em), measured from the font, so names fit before layout. */
const IT800: Record<string, number> = {
  A: 0.743, B: 0.636, C: 0.732, D: 0.702, E: 0.589, F: 0.556, G: 0.739, H: 0.72, I: 0.257, J: 0.551, K: 0.674, L: 0.541, M: 0.896,
  N: 0.701, O: 0.76, P: 0.624, Q: 0.762, R: 0.634, S: 0.632, T: 0.649, U: 0.698, V: 0.743, W: 1.035, X: 0.71, Y: 0.717, Z: 0.652,
  Æ: 1.015, Œ: 1.009, "'": 0.329, '-': 0.443, '.': 0.327, ' ': 0.188, '?': 0.554,
};
const emWidthTight = (s: string) => [...s.normalize('NFD').replace(/[̀-ͯ]/g, '')].reduce((t, ch) => t + (IT800[ch] ?? (/\d/.test(ch) ? 0.65 : 0.7)), 0);
const fit = (label: string, base: number, maxW: number, min: number, track = 0.01) => Math.max(min, Math.min(base, maxW / (emWidthTight(label) + track * label.length)));

const inferSize = (w: number): CardSize => (w >= 200 ? 'full' : w >= 90 ? 'grid' : w >= 62 ? 'hand' : 'board');
const resolveSize = (s: CardSize | LegacySize | undefined, w: number | undefined): CardSize =>
  s === 'lg' ? 'full' : s === 'md' || s === 'sm' ? 'grid' : s ?? (w ? inferSize(w) : 'grid');

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

/** Photo placement per size: [left, top, width] in u (art is 600×800). */
function photoBox(size: CardSize, breakout: boolean, headTop: number): [number, number, number] {
  if (size === 'full') return breakout ? [8, -3 - headTop * 133.33, 100] : [15, 3.2, 86];
  if (size === 'board') return [-25, -24, 150];
  return [-1, -11, 112];
}

function concentric(cx: number, cy: number, r0: number, step: number) {
  let d = '';
  for (let r = r0; r > step; r -= step) d += `M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;
  return d;
}

function lines118(w: number, h: number, step: number) {
  // diagonal engraving: lines at 118° every `step`, one path
  const dx = Math.tan((28 * Math.PI) / 180) * h;
  let d = '';
  for (let x = -dx; x < w + dx; x += step) d += `M${x.toFixed(1)} 0L${(x + dx).toFixed(1)} ${h.toFixed(1)}`;
  return d;
}

function seeded(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const darken = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

// ---------------------------------------------------------------------------
// the face
// ---------------------------------------------------------------------------

interface FaceProps {
  card: PlayerCard;
  w: number;
  size: CardSize;
  look: Look;
  art: Art | null;
  collected?: boolean;
  competition: string;
  season: string;
  power?: number;
  state?: 'pending' | 'unaffordable';
  mystery?: boolean;
  /** draw the stats-row trait text (RN Text) and the type; false on the back */
  back?: boolean;
  /** full card: animated sheen position 0-100; static otherwise */
  sheenX?: SharedValue<number>;
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

function Sheen({ uid, w, H, u, x, strength }: { uid: string; w: number; H: number; u: (n: number) => number; x?: SharedValue<number>; strength: number }) {
  // a 112° band: in a frame rotated 22° about the centre, it's an axis-aligned rect that slides along x
  const L = u(145.2);
  const bandW = L * 0.52;
  const at = (mx: number) => w / 2 - L / 2 + ((mx - 34) / 100) * L;
  const props = useAnimatedProps(() => ({ x: at(x ? x.value : 30) }));
  return (
    <G transform={`rotate(22 ${w / 2} ${H / 2})`}>
      <Defs>
        <LG id={`${uid}sh`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.26 * strength} />
          <Stop offset="0.69" stopColor="#FFFFFF" stopOpacity={0.08 * strength} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LG>
      </Defs>
      {x ? (
        <AnimatedRect animatedProps={props} y={-H} width={bandW} height={H * 3} fill={`url(#${uid}sh)`} />
      ) : (
        <Rect x={at(30)} y={-H} width={bandW} height={H * 3} fill={`url(#${uid}sh)`} />
      )}
    </G>
  );
}

function Foil({ uid, w, H, u, kind, mx = 30 }: { uid: string; w: number; H: number; u: (n: number) => number; kind: 'pearl' | 'gold' | 'prism'; mx?: number }) {
  const L = u(149.8);
  const len = L * (kind === 'pearl' ? 2.4 : 2.6);
  const x = w / 2 + ((50 - mx) / 100) * (len - L) - len / 2;
  const stops: [number, string, number][] =
    kind === 'pearl'
      ? [[0, '#FFFFFF', 0], [0.22, '#FFC8E6', 0.9], [0.36, '#FFF0C8', 0.9], [0.5, '#C8FFF0', 0.9], [0.64, '#C8D7FF', 0.9], [0.78, '#EBCDFF', 0.9], [1, '#FFFFFF', 0]]
      : kind === 'gold'
      ? [[0, '#FFECAA', 0], [0.3, '#FFECAA', 0], [0.42, '#FFECAA', 0.9], [0.46, '#FFFFFF', 0.7], [0.5, '#FFECAA', 0.9], [0.62, '#FFECAA', 0], [1, '#FFECAA', 0]]
      : [[0, '#FF5AAA', 0], [0.18, '#FF5AAA', 0.9], [0.32, '#FFD664', 0.9], [0.47, '#6EFFD2', 0.9], [0.62, '#5AA0FF', 0.9], [0.78, '#C86EFF', 0.9], [1, '#FF5AAA', 0]];
  const op = kind === 'pearl' ? 0.3 : kind === 'gold' ? 0.3 : 0.22;
  return (
    <G opacity={op * 0.75} transform={`rotate(25 ${w / 2} ${H / 2})`}>
      <Defs>
        <LG id={`${uid}foil`} x1="0" y1="0" x2="1" y2="0">
          {stops.map(([o, c, a]) => (
            <Stop key={o} offset={o} stopColor={c} stopOpacity={a} />
          ))}
        </LG>
      </Defs>
      <Rect x={x} y={-H} width={len} height={H * 3} fill={`url(#${uid}foil)`} />
    </G>
  );
}

/** The not-owned mark: a small padlock in a dark disc, ringed in the card's metal. */
function Lock({ cx, cy, r, stroke }: { cx: number; cy: number; r: number; stroke: string }) {
  const k = r / 10;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill="#0C0C0F" opacity={0.92} />
      <Circle cx={cx} cy={cy} r={r - Math.max(0.5, k * 0.6)} fill="none" stroke={stroke} strokeWidth={Math.max(0.8, k * 1.2)} />
      <Path d={`M ${cx - 3 * k} ${cy - 0.6 * k} v ${-2 * k} a ${3 * k} ${3 * k} 0 0 1 ${6 * k} 0 v ${2 * k}`} fill="none" stroke="#F4F4F6" strokeWidth={Math.max(0.9, 1.3 * k)} strokeLinecap="round" />
      <Rect x={cx - 4.4 * k} y={cy - 0.8 * k} width={8.8 * k} height={6.4 * k} rx={1.2 * k} fill="#F4F4F6" />
    </G>
  );
}

function Face({ card, w, size, look, art, collected, competition, season, power, state, mystery, back, sheenX }: FaceProps) {
  const uid = 'c' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const u = (n: number) => (n * w) / 100;
  const H = w * CARD_RATIO;
  const legend = look.tier === 6;
  const mk: Metal = legend ? 'legend' : card.rarity;
  const m = cardMetal[mk];
  const gold = cardMetal.elite;
  const full = size === 'full';
  const small = size === 'hand' || size === 'board';
  const dim = collected === false;
  const photo = mystery ? null : art;
  const bo = full && !dim && !back && !!photo && breaksFrame(card, look);
  const monoBreak = full && !dim && !back && !photo && look.tier >= 1;
  const { c1, c2 } = { c1: card.team.colors.primary, c2: card.team.colors.secondary };
  const cf = clubField(c1, c2, m);
  const stats = cardStats(card);

  // the rim is wider below full size so the metal still reads at 110 pt
  const fi = (full ? 7 : 10) + (m.band ? 1.5 : 0);
  const paths = useMemo(
    () => ({ outer: cardPath(w, 0, 6), band: cardPath(w, fi - 4, 5), face: cardPath(w, fi, 4), hair: cardPath(w, fi + 4.5, 3) }),
    [w, fi]
  );
  const padX = u(6);
  const padTop = bo || monoBreak ? u(8) : u(2);
  const padBot = full ? u(9) : u(4);

  // ---------------------------------------------------------------- art
  const [pl, pt, pw] = photoBox(size, bo, photo?.headTop ?? 0.1);
  const ph = (pw * 4) / 3;
  const imgProps = { x: u(pl), y: u(pt), width: u(pw), height: u(ph), href: photo?.src ?? '', preserveAspectRatio: 'xMidYMid slice' as const };
  const sticker = look.premium && !!photo && !back;
  const outline = u(1.2);
  const OFFS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];
  const stickerCopies = (key: string) =>
    OFFS.map(([dx, dy], i) => <SvgImage key={`${key}${i}`} {...imgProps} x={u(pl) + dx * outline} y={u(pt) + dy * outline} />);

  // photos off: sash + medallion
  const sashCy = full ? 46 : size === 'board' ? 52 : 55;
  const sashH = size === 'board' ? 36 : 30;
  const med = full ? (monoBreak ? { cx: 56, cy: 33, d: 58, f: 33.6 } : { cx: 56, cy: 44, d: 50, f: 29 }) : size === 'board' ? null : { cx: 55, cy: 50, d: 62, f: 36 };
  const medGold = look.premium;
  const letter = mystery ? '?' : initialOf(card.name);
  const medRim = medGold ? 'medRimG' : 'rim';
  const medNum = medGold ? gold.numeral : m.numeral;

  const medallion = (mm: { cx: number; cy: number; d: number; f: number }) => {
    const r = u(mm.d / 2);
    const cx = u(mm.cx);
    const cy = u(mm.cy);
    const fs = u(mm.f);
    const base = cy - u(1) + fs * 0.3635;
    return (
      <G>
        <Circle cx={cx} cy={cy + u(2.2)} r={r + u(2)} fill="#000" opacity={0.16} />
        <Circle cx={cx} cy={cy + u(1.2)} r={r + u(1.2)} fill="#000" opacity={0.28} />
        <Circle cx={cx} cy={cy} r={r + u(1.4)} fill={`url(#${uid}${medRim})`} />
        <Circle cx={cx} cy={cy} r={r + u(0.5)} fill="#000" opacity={0.55} />
        <Circle cx={cx} cy={cy} r={r} fill={`url(#${uid}medFill)`} />
        <Path d={concentric(cx, cy, r - u(0.3), u(full ? 1.05 : 1.6))} stroke="#FFFFFF" strokeOpacity={0.07} strokeWidth={u(full ? 0.2 : 0.3)} fill="none" />
        <Circle cx={cx} cy={cy} r={r - u(0.275)} stroke="#000" strokeOpacity={0.55} strokeWidth={u(0.55)} fill="none" />
        <Defs>
          <LG id={`${uid}let`} x1="0" y1={cy - fs * 0.5 - u(1)} x2="0" y2={cy + fs * 0.5 - u(1)} gradientUnits="userSpaceOnUse">
            {[0, 0.46, 0.54, 1].map((o, i) => (
              <Stop key={o} offset={o} stopColor={medNum[i] ?? medNum[medNum.length - 1]} />
            ))}
          </LG>
        </Defs>
        <SvgText x={cx} y={base + u(0.6)} fontSize={fs} fontFamily={font.cardHeavy} letterSpacing={-0.04 * fs} textAnchor="middle" fill="#000" opacity={0.6}>{letter}</SvgText>
        <SvgText x={cx} y={base - u(0.25)} fontSize={fs} fontFamily={font.cardHeavy} letterSpacing={-0.04 * fs} textAnchor="middle" fill="#FFFFFF" opacity={0.14}>{letter}</SvgText>
        <SvgText x={cx} y={base} fontSize={fs} fontFamily={font.cardHeavy} letterSpacing={-0.04 * fs} textAnchor="middle" fill={`url(#${uid}let)`}>{letter}</SvgText>
      </G>
    );
  };

  const sash = (
    <G opacity={luminance(cf.accent) > 0.5 ? 0.2 : 0.62} transform={`rotate(-28 ${u(50)} ${u(sashCy)})`}>
      <Rect x={u(-40)} y={u(sashCy - sashH / 2)} width={u(180)} height={u(sashH * 0.016)} fill={`url(#${uid}s2)`} />
      <Rect x={u(-40)} y={u(sashCy - sashH / 2 + sashH * 0.055)} width={u(180)} height={u(sashH * 0.89)} fill={`url(#${uid}s1)`} />
      <Rect x={u(-40)} y={u(sashCy + sashH / 2 - sashH * 0.016)} width={u(180)} height={u(sashH * 0.016)} fill={`url(#${uid}s2)`} />
    </G>
  );

  const artLayer = back ? null : photo ? (
    <G>
      {sticker ? (
        <G mask={`url(#${uid}pm)`}>
          <G filter={`url(#${uid}white)`}>{stickerCopies('s')}</G>
        </G>
      ) : null}
      <SvgImage {...imgProps} mask={`url(#${uid}pm)`} />
    </G>
  ) : (
    <G>
      {sash}
      {med && !monoBreak ? medallion(med) : null}
      {size === 'board' ? (
        <SvgText x={u(50)} y={u(44 - 1) + u(58) * 0.3635} fontSize={u(58)} fontFamily={font.cardHeavy} textAnchor="middle" fill={`url(#${uid}num)`} opacity={0.55}>
          {letter}
        </SvgText>
      ) : null}
    </G>
  );

  // ---------------------------------------------------------------- type
  const T = (p: { x: number; y: number; size: number; fam: string; fill: string; ls?: number; anchor?: 'start' | 'middle' | 'end'; op?: number; shadow?: number; children: string }) => (
    <G>
      {p.shadow ? (
        <SvgText x={p.x} y={p.y + p.shadow} fontSize={p.size} fontFamily={p.fam} letterSpacing={p.ls ?? 0} textAnchor={p.anchor ?? 'middle'} fill="#000" opacity={0.55} stroke="#000" strokeOpacity={0.25} strokeWidth={p.shadow * 1.4}>
          {p.children}
        </SvgText>
      ) : null}
      <SvgText x={p.x} y={p.y} fontSize={p.size} fontFamily={p.fam} letterSpacing={p.ls ?? 0} textAnchor={p.anchor ?? 'middle'} fill={p.fill} opacity={p.op ?? 1}>
        {p.children}
      </SvgText>
    </G>
  );

  const gemAt = (cx: number, cy: number, r: number, ring: number, fs: number) => {
    const off = state === 'unaffordable';
    return (
      <G>
        <Circle cx={u(cx)} cy={u(cy) + u(1)} r={u(r) + u(0.6)} fill="#000" opacity={0.3} />
        <Circle cx={u(cx)} cy={u(cy)} r={u(r)} fill={`url(#${uid}rim)`} />
        <Circle cx={u(cx)} cy={u(cy)} r={u(r - ring)} fill={`url(#${uid}${off ? 'gemOff' : 'gem'})`} />
        <Circle cx={u(cx)} cy={u(cy)} r={u(r - ring) - u(0.3)} fill="none" stroke={`url(#${uid}gemHi)`} strokeWidth={u(0.6)} />
        <SvgText x={u(cx)} y={u(cy) + fs * 0.364 + u(0.3)} fontSize={fs} fontFamily={font.cardHeavy} textAnchor="middle" fill="#000A3C" opacity={0.5}>
          {String(stats.cost)}
        </SvgText>
        <SvgText x={u(cx)} y={u(cy) + fs * 0.364} fontSize={fs} fontFamily={font.cardHeavy} textAnchor="middle" fill="#FFFFFF" opacity={off ? 0.7 : 1}>
          {String(stats.cost)}
        </SvgText>
      </G>
    );
  };

  const nameLabel = (mystery ? '? ? ?' : faceName(card.name, card.nationality)).toUpperCase();
  const slots = mystery ? faceStats(card) : faceStats(card);
  const trait = card.abilities.find((a) => a.kind === 'trait') ?? card.abilities[0];
  const ink = m.ink;

  let type: React.ReactNode = null;
  if (!back && full) {
    const nfs = fit(nameLabel, u(8.6), u(92), u(6.4));
    const cols = slots ?? [];
    const cw = 82 / Math.max(1, cols.length);
    type = (
      <G>
        {/* left column: Power, position, nation, kit, club */}
        <Defs>
          <LG id={`${uid}num`} x1="0" y1={u(9.22)} x2="0" y2={u(9.22 + 13.76)} gradientUnits="userSpaceOnUse">
            {[0, 0.46, 0.54, 1].map((o, i) => (
              <Stop key={o} offset={o} stopColor={m.numeral[i] ?? m.numeral[m.numeral.length - 1]} />
            ))}
          </LG>
          <LG id={`${uid}nameG`} x1="0" y1={u(95.3)} x2="0" y2={u(95.3) + nfs} gradientUnits="userSpaceOnUse">
            {[0, 0.46, 0.54, 1].map((o, i) => (
              <Stop key={o} offset={o} stopColor={gold.numeral[i]} />
            ))}
          </LG>
        </Defs>
        <SvgText x={u(16.5)} y={u(21.92) + u(0.35)} fontSize={u(16)} fontFamily={font.cardHeavy} letterSpacing={-u(0.8)} textAnchor="middle" fill="#000" opacity={0.55}>{String(stats.power)}</SvgText>
        <SvgText x={u(16.5)} y={u(21.92)} fontSize={u(16)} fontFamily={font.cardHeavy} letterSpacing={-u(0.8)} textAnchor="middle" fill={`url(#${uid}num)`}>{String(stats.power)}</SvgText>
        {card.line ? T({ x: u(16.5) + u(0.22), y: u(28.17), size: u(4.4), fam: font.cardHeavy, fill: ink, ls: u(0.44), children: LINE_CODE[card.line] }) : null}
        <Rect x={u(12.5)} y={u(31.28)} width={u(8)} height={u(0.32)} fill={m.line} />
        {nationCode(card.nationality) ? T({ x: u(16.5) + u(0.25), y: u(37.06), size: u(3.6), fam: font.semibold, fill: ink, ls: u(0.5), children: nationCode(card.nationality)! }) : null}
        <Circle cx={u(16.5)} cy={u(43.65)} r={u(4.1)} fill={m.line} />
        <Circle cx={u(16.5)} cy={u(43.65)} r={u(3.7)} fill="#000" opacity={0.6} />
        <Circle cx={u(16.5)} cy={u(43.65)} r={u(3.2)} fill={c2} />
        <Path d={`M ${u(16.5 + 3.2 * 0.7071)} ${u(43.65 - 3.2 * 0.7071)} A ${u(3.2)} ${u(3.2)} 0 0 0 ${u(16.5 - 3.2 * 0.7071)} ${u(43.65 + 3.2 * 0.7071)} Z`} fill={c1} />
        {T({ x: u(16.5) + u(0.23), y: u(51.41), size: u(3.3), fam: font.bold, fill: ink, ls: u(0.46), children: teamCode(card.team) })}
        {gemAt(87.66, 13.9, 6.55, 0.95, u(7.2))}
        {/* name, rule, stats */}
        {T({ x: u(50), y: u(95.3) + nfs * 0.8635, size: nfs, fam: font.cardHeavy, fill: look.premium && photo ? `url(#${uid}nameG)` : m.name, ls: nfs * 0.01, shadow: u(0.4), children: nameLabel })}
        <Rect x={u(14)} y={u(106.6)} width={u(72)} height={u(0.3)} fill={`url(#${uid}nrule)`} />
        {slots
          ? cols.map((s, i) => {
              const cx = u(9 + cw * (i + 0.5));
              return (
                <G key={s.label}>
                  {i > 0 ? <Rect x={u(9 + cw * i) - u(0.125)} y={u(110.9)} width={u(0.25)} height={u(8.2)} fill={m.line} opacity={0.45} /> : null}
                  {T({ x: cx, y: u(115.58), size: u(6.4), fam: font.cardBold, fill: m.stat, ls: -u(0.128), children: s.value })}
                  {T({ x: cx + u(0.2), y: u(119.75), size: u(2.55), fam: font.semibold, fill: ink, ls: u(0.41), children: s.label })}
                </G>
              );
            })
          : trait
          ? T({ x: u(50) + u(0.2), y: u(112), size: u(2.55), fam: font.semibold, fill: ink, ls: u(0.41), children: trait.title.toUpperCase() })
          : null}
        {T({ x: u(50) + u(0.26), y: u(128.97), size: u(2.2), fam: font.semibold, fill: ink, op: 0.85, ls: u(0.53), children: (legend ? `LEGEND · ${look.finish ? FINISH_NAME[look.finish] : 'GILDED'} · ${season}` : [competition, season].filter(Boolean).join(' · ')).toUpperCase() })}
      </G>
    );
  } else if (!back && (size === 'grid' || size === 'hand')) {
    const nfs = fit(nameLabel, u(11.2), u(90), u(7.5));
    type = (
      <G>
        <Defs>
          <LG id={`${uid}num`} x1="0" y1={u(7)} x2="0" y2={u(7 + 18.92)} gradientUnits="userSpaceOnUse">
            {[0, 0.46, 0.54, 1].map((o, i) => (
              <Stop key={o} offset={o} stopColor={m.numeral[i] ?? m.numeral[m.numeral.length - 1]} />
            ))}
          </LG>
        </Defs>
        <SvgText x={u(7)} y={u(24.46) + u(0.5)} fontSize={u(22)} fontFamily={font.cardHeavy} letterSpacing={-u(1.1)} fill="#000" opacity={0.55}>{String(stats.power)}</SvgText>
        <SvgText x={u(7)} y={u(24.46)} fontSize={u(22)} fontFamily={font.cardHeavy} letterSpacing={-u(1.1)} fill={`url(#${uid}num)`}>{String(stats.power)}</SvgText>
        {gemAt(83.5, 16.99, 10.5, 1.3, u(12))}
        {size === 'grid' ? (
          <G>
            {T({ x: u(50), y: u(105.5) + nfs * 0.9635, size: nfs, fam: font.cardHeavy, fill: m.name, ls: nfs * 0.01, shadow: u(0.6), children: nameLabel })}
            <Rect x={u(39)} y={u(123.14)} width={u(22)} height={u(0.9)} rx={u(0.45)} fill={`url(#${uid}rim)`} opacity={0.85} />
          </G>
        ) : null}
      </G>
    );
  } else if (!back && size === 'board') {
    const p = power ?? stats.power;
    const fill = p > stats.power ? color.win : p < stats.power ? color.loss : '#FFFFFF';
    const y = u(photo ? 87.97 : 89.97) + u(40) * 0.8635;
    type = (
      <G>
        {!photo ? (
          <Defs>
            <LG id={`${uid}num`} x1="0" y1={u(24)} x2="0" y2={u(82)} gradientUnits="userSpaceOnUse">
              {[0, 0.46, 0.54, 1].map((o, i) => (
                <Stop key={o} offset={o} stopColor={m.numeral[i] ?? m.numeral[m.numeral.length - 1]} />
              ))}
            </LG>
          </Defs>
        ) : null}
        <SvgText x={u(50)} y={y + u(1.2)} fontSize={u(40)} fontFamily={font.cardHeavy} letterSpacing={-u(1.6)} textAnchor="middle" fill="#000" opacity={0.7} stroke="#000" strokeOpacity={0.5} strokeWidth={u(3)}>{String(p)}</SvgText>
        <SvgText x={u(50)} y={y} fontSize={u(40)} fontFamily={font.cardHeavy} letterSpacing={-u(1.6)} textAnchor="middle" fill={fill}>{String(p)}</SvgText>
      </G>
    );
  }

  // ---------------------------------------------------------------- finishes
  const foil: 'pearl' | 'gold' | 'prism' | null = dim
    ? null
    : legend && look.finish === 'prism'
    ? 'prism'
    : card.rarity === 'icon' || look.tier === 5
    ? 'pearl'
    : card.rarity === 'elite' || (legend && look.finish === 'gold')
    ? 'gold'
    : null;
  const specks = useMemo(() => {
    if (!(legend && look.finish === 'stellar')) return null;
    const r = seeded(card.id);
    return Array.from({ length: 40 }, () => ({ x: r() * 100, y: r() * 130, o: 0.3 + r() * 0.4 }));
  }, [legend, look.finish, card.id]);
  const crackle = useMemo(() => {
    if (!(legend && look.finish === 'krackle')) return '';
    const r = seeded(card.id * 7 + 3);
    let d = '';
    for (let i = 0; i < 22; i++) {
      let x = r() * 100;
      let y = r() * 135;
      d += `M${u(x).toFixed(1)} ${u(y).toFixed(1)}`;
      for (let k = 0; k < 4; k++) {
        x += (r() - 0.5) * 22;
        y += (r() - 0.5) * 18;
        d += `L${u(x).toFixed(1)} ${u(y).toFixed(1)}`;
      }
    }
    return d;
  }, [legend, look.finish, card.id, w]);

  const rimStops = (medGold ? gold : m).rim;

  return (
    <Svg
      width={w + padX * 2}
      height={H + padTop + padBot}
      viewBox={`${-padX} ${-padTop} ${w + padX * 2} ${H + padTop + padBot}`}
      style={{ position: 'absolute', left: -padX, top: -padTop }}
      pointerEvents="none"
    >
      <Defs>
        <LG id={`${uid}rim`} x1="0" y1="0" x2="1" y2="1">
          {m.rim.colors.map((c, i) => (
            <Stop key={i} offset={m.rim.locations[i]} stopColor={c} />
          ))}
        </LG>
        <LG id={`${uid}medRimG`} x1="0" y1="0" x2="1" y2="1">
          {rimStops.colors.map((c, i) => (
            <Stop key={i} offset={rimStops.locations[i]} stopColor={c} />
          ))}
        </LG>
        <ClipPath id={`${uid}face`}>
          <Path d={paths.face} />
        </ClipPath>
        <ClipPath id={`${uid}outer`}>
          <Path d={paths.outer} />
        </ClipPath>
        <ClipPath id={`${uid}bo`}>
          <Rect x={u(-10)} y={u(-40)} width={u(120)} height={u(44.4)} />
        </ClipPath>
        {/* the club field: lit at the top, the kit colour through the middle, settling into the metal's dark plate */}
        <LG id={`${uid}base`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={back ? cf.deep : cf.light} />
          <Stop offset="0.42" stopColor={back ? cf.deep : cf.field} />
          <Stop offset="0.7" stopColor={cf.deep} />
          <Stop offset="1" stopColor={m.plate} />
        </LG>
        {/* light falling on the field behind the head */}
        <RG id={`${uid}halo`}>
          <Stop offset="0" stopColor={mix(cf.field, '#FFFFFF', 0.4)} stopOpacity={0.5} />
          <Stop offset="0.5" stopColor={mix(cf.field, '#FFFFFF', 0.2)} stopOpacity={0.18} />
          <Stop offset="1" stopColor={cf.field} stopOpacity={0} />
        </RG>
        <LG id={`${uid}bevel`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.7} />
          <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.7" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.45} />
        </LG>
        {m.band ? (
          <LG id={`${uid}band`} x1="0" y1="0" x2="1" y2="1">
            {m.band.colors.map((c, i) => (
              <Stop key={i} offset={m.band!.locations[i]} stopColor={c} />
            ))}
          </LG>
        ) : null}
        <RG id={`${uid}engM`}>
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity={0} />
        </RG>
        <Mask id={`${uid}eng`} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={H}>
          <Rect x={u(58 - 70)} y={u(42 - 60)} width={u(140)} height={u(120)} fill={`url(#${uid}engM)`} />
        </Mask>
        <LG id={`${uid}vigL`} x1="0" y1="0" x2="0" y2="1">
          {/* the photo dissolves into the club's deep colour, not into grey */}
          <Stop offset="0.56" stopColor={cf.deep} stopOpacity={0} />
          <Stop offset="0.72" stopColor={cf.deep} stopOpacity={0.62} />
          <Stop offset="0.86" stopColor={m.plate} stopOpacity={0.7} />
          <Stop offset="1" stopColor={m.plate} stopOpacity={0.8} />
        </LG>
        <RG id={`${uid}vigR`}>
          <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.45} />
        </RG>
        {/* photo fade: opaque to 57% of the image height, gone by 80%; the left 9% fades in */}
        <LG id={`${uid}pmV`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.57" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="0.8" stopColor="#FFFFFF" stopOpacity={0} />
        </LG>
        <LG id={`${uid}pmH`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </LG>
        <Mask id={`${uid}pm`} maskUnits="userSpaceOnUse" x={u(-60)} y={u(-60)} width={u(220)} height={u(260)}>
          <Rect x={u(pl)} y={u(pt)} width={u(pw)} height={u(ph)} fill={`url(#${uid}pmV)`} />
          <Rect x={u(pl) - outline} y={u(pt)} width={u(pw) * 0.09 + outline} height={u(ph)} fill={`url(#${uid}pmH)`} />
        </Mask>
        <LG id={`${uid}s1`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={cf.accent} stopOpacity={0.55} />
          <Stop offset="0.3" stopColor={cf.accent} stopOpacity={1} />
          <Stop offset="0.7" stopColor={cf.accent} stopOpacity={1} />
          <Stop offset="1" stopColor={cf.accent} stopOpacity={0.55} />
        </LG>
        <LG id={`${uid}s2`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={m.line} stopOpacity={0.4} />
          <Stop offset="0.5" stopColor={m.line} stopOpacity={1} />
          <Stop offset="1" stopColor={m.line} stopOpacity={0.4} />
        </LG>
        <RG id={`${uid}medFill`} cx="0.5" cy="0.36" r="0.8" fx="0.5" fy="0.3">
          <Stop offset="0" stopColor={mix(cf.field, '#FFFFFF', 0.12)} />
          <Stop offset="1" stopColor={cf.deep} />
        </RG>
        <RG id={`${uid}gem`} cx="0.34" cy="0.28" r="0.98" fx="0.34" fy="0.28">
          <Stop offset="0" stopColor={gem.hi} />
          <Stop offset="0.4" stopColor={gem.mid} />
          <Stop offset="0.74" stopColor={gem.low} />
          <Stop offset="1" stopColor={gem.edge} />
        </RG>
        <RG id={`${uid}gemOff`} cx="0.34" cy="0.28" r="0.98" fx="0.34" fy="0.28">
          <Stop offset="0" stopColor={GEM_OFF.hi} />
          <Stop offset="0.4" stopColor={GEM_OFF.mid} />
          <Stop offset="0.74" stopColor={GEM_OFF.low} />
          <Stop offset="1" stopColor={GEM_OFF.edge} />
        </RG>
        <LG id={`${uid}gemHi`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.45} />
          <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
          <Stop offset="0.75" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.35} />
        </LG>
        <LG id={`${uid}nrule`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={m.line} stopOpacity={0} />
          <Stop offset="0.2" stopColor={m.line} />
          <Stop offset="0.8" stopColor={m.line} />
          <Stop offset="1" stopColor={m.line} stopOpacity={0} />
        </LG>
        <Filter id={`${uid}white`}>
          <FeColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
        </Filter>
        {full ? (
          <Filter id={`${uid}blur`} x="-20%" y="-20%" width="140%" height="140%">
            <FeGaussianBlur stdDeviation={u(2.2)} />
          </Filter>
        ) : null}
      </Defs>

      {/* drop shadow */}
      {full ? (
        <Path d={paths.outer} fill="#000" opacity={0.6} transform={`translate(0 ${u(2.4)})`} filter={`url(#${uid}blur)`} />
      ) : (
        <Path d={paths.outer} fill="#000" opacity={0.4} transform={`translate(0 ${u(small ? 1 : 1.8)})`} />
      )}
      {state === 'pending' ? <Path d={paths.outer} fill="none" stroke={color.accentText} strokeWidth={3} opacity={0.9} /> : null}

      {/* 1 rim: the metal, a bevel catching the light top-left, and the gold inner band on Icon and Legend */}
      <Path d={paths.outer} fill={`url(#${uid}rim)`} />
      {!dim ? (
        <G clipPath={`url(#${uid}outer)`}>
          <Path d={paths.outer} fill="none" stroke={`url(#${uid}bevel)`} strokeWidth={Math.max(1.2, u(1.6))} />
        </G>
      ) : null}
      {m.band ? <Path d={paths.band} fill={`url(#${uid}band)`} /> : null}
      <Path d={paths.outer} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1} />

      {/* 2 face */}
      <G clipPath={`url(#${uid}face)`}>
        <Rect x={0} y={0} width={w} height={H} fill={`url(#${uid}base)`} />
        {!back ? (
          <>
            <Rect x={u(58 - 46)} y={H * 0.27 - u(44)} width={u(92)} height={u(88)} fill={`url(#${uid}halo)`} />
            {full ? <Path d={lines118(w, H, u(1.25))} stroke="#FFFFFF" strokeOpacity={0.03} strokeWidth={u(0.22)} mask={`url(#${uid}eng)`} /> : null}
            {look.tier >= 4 && full ? (
              SHOW_CRESTS && card.team.crest ? (
                <SvgImage href={card.team.crest} x={u(52)} y={u(20)} width={u(44)} height={u(44)} opacity={0.08} preserveAspectRatio="xMidYMid meet" />
              ) : (
                <SvgText x={u(56)} y={u(70)} fontSize={u(40)} fontFamily={font.cardHeavy} textAnchor="middle" fill="#FFFFFF" opacity={0.06}>{teamCode(card.team)}</SvgText>
              )
            ) : null}
            {artLayer}
            <Rect x={0} y={0} width={w} height={H} fill={`url(#${uid}vigL)`} />
            <Rect x={u(-80)} y={H * 0.34 - u(126)} width={u(260)} height={u(252)} fill={`url(#${uid}vigR)`} />
            {crackle ? <Path d={crackle} stroke="#E9C46A" strokeOpacity={0.18} strokeWidth={u(0.25)} fill="none" /> : null}
            {specks ? specks.map((s, i) => <Circle key={i} cx={u(s.x)} cy={u(s.y)} r={u(0.2)} fill="#FFFFFF" opacity={s.o} />) : null}
          </>
        ) : null}
      </G>

      {/* 3 engraved hairline + inner edge */}
      {!small ? <Path d={paths.hair} fill="none" stroke={legend ? '#E9C46A' : `url(#${uid}rim)`} strokeOpacity={legend ? 0.9 : 0.55} strokeWidth={0.8} /> : null}
      <Path d={paths.face} fill="none" stroke={legend ? '#B98A2E' : 'rgba(0,0,0,0.7)'} strokeWidth={legend ? 1.2 : 1} />

      {/* 4 breakout: the head over the rim */}
      {bo ? (
        <G clipPath={`url(#${uid}bo)`}>
          {sticker ? <G filter={`url(#${uid}white)`}>{stickerCopies('b')}</G> : null}
          <SvgImage {...imgProps} />
        </G>
      ) : null}
      {monoBreak && med ? medallion(med) : null}

      {/* 5 type */}
      {type}

      {/* 6 finishes: static sheen (the full card animates it) and foil */}
      {!dim && !back ? (
        <G clipPath={`url(#${uid}outer)`}>
          {foil ? <Foil uid={uid} w={w} H={H} u={u} kind={foil} /> : null}
          <Sheen uid={uid} w={w} H={H} u={u} x={sheenX} strength={0.6} />
        </G>
      ) : null}

      {/* 7 not owned: full colour under a light shade, and a lock at the shield point */}
      {dim ? <Path d={paths.outer} fill={UNOWNED} /> : null}
      {dim && size === 'grid' ? <Lock cx={u(50)} cy={u(131.4)} r={u(5.6)} stroke={`url(#${uid}rim)`} /> : null}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// the back (flipped full card)
// ---------------------------------------------------------------------------

function BackFace({ card, w, look, art, competition, season }: { card: PlayerCard; w: number; look: Look; art: Art | null; competition: string; season: string }) {
  const u = (n: number) => (n * w) / 100;
  const m = cardMetal[look.tier === 6 ? 'legend' : card.rarity];
  const s = card.stats;
  const g = cardStats(card);
  const [why1, why2] = explainStats(card, g.cost, g.power, GOAL_BONUS_CAP);
  const rows: [string, string][] = [];
  if (s) {
    rows.push(['Goals', String(s.goals)]);
    if (s.assists !== null) rows.push(['Assists', String(s.assists)]);
    if (s.penalties !== null) rows.push(['Penalties', String(s.penalties)]);
    if (s.played !== null) rows.push(['Appearances', String(s.played)]);
    if (s.played) rows.push(['Goals per game', (s.goals / s.played).toFixed(2)]);
  }
  if (card.rank !== null) rows.push(['Rank', `#${card.rank} of 20 scorers`]);
  const meta = [card.team.shortName, card.position, card.nationality, card.age !== null ? String(card.age) : null].filter(Boolean).join(' · ');
  const label = { fontFamily: font.semibold, fontSize: u(2.9), letterSpacing: u(0.4), color: m.ink } as const;
  const body = { fontFamily: font.medium, fontSize: u(3.8), lineHeight: u(5.2), color: m.stat } as const;
  return (
    <View style={{ width: w, height: w * CARD_RATIO }} pointerEvents="none">
      <Face card={card} w={w} size="full" look={look} art={null} competition={competition} season={season} back />
      <View style={{ position: 'absolute', left: u(11), right: u(11), top: u(9), bottom: u(16) }}>
        <Text style={{ fontFamily: font.cardHeavy, fontSize: u(7), color: m.name, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
          {card.name.toUpperCase()}
        </Text>
        <Text style={{ fontFamily: font.medium, fontSize: u(3.4), color: m.ink, textAlign: 'center', marginTop: u(1) }} numberOfLines={1}>
          {meta}
        </Text>
        <Text style={[label, { marginTop: u(5) }]}>{`SEASON · ${competition.toUpperCase()} ${season}`}</Text>
        {rows.length ? (
          rows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: m.line, paddingVertical: u(1.1) }}>
              <Text style={[body, { opacity: 0.85 }]}>{k}</Text>
              <Text style={[body, { fontFamily: font.cardBold, fontVariant: ['tabular-nums'] }]}>{v}</Text>
            </View>
          ))
        ) : (
          <Text style={[body, { marginTop: u(1.5) }]}>{`Not among the ${competition || 'league'}'s top 20 scorers. ${card.abilities.map((a) => a.text).join(' ')}`}</Text>
        )}
        <Text style={[label, { marginTop: u(4), color: color.accentText, opacity: 1 }]}>DUEL</Text>
        <Text style={body}>{`Cost ${g.cost} · Power ${g.power}${g.effect ? `. ${g.effect.text}` : ''}`}</Text>
        <Text style={[label, { marginTop: u(3.5) }]}>HOW IT'S WORKED OUT</Text>
        <Text style={[body, { fontSize: u(3.3), lineHeight: u(4.6), opacity: 0.85 }]}>{`${why1} ${why2}`}</Text>
      </View>
      {art ? (
        <Text style={{ position: 'absolute', left: u(14), right: u(14), bottom: u(10.5), textAlign: 'center', fontFamily: font.medium, fontSize: u(2.5), color: m.ink, opacity: 0.75 }} numberOfLines={2}>
          {`Photo: ${art.artist} · ${art.license} · Wikimedia Commons (edited)`}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// the card
// ---------------------------------------------------------------------------

export interface SnapCardProps {
  card: PlayerCard;
  size?: CardSize | LegacySize;
  width?: number;
  look?: Look;
  flipped?: boolean;
  interactive?: boolean;
  idleShimmer?: boolean;
  collected?: boolean;
  competition?: string;
  /** "26/27"; defaults to the season of today's date */
  season?: string;
  loadPhoto?: boolean;
  /** board: the current Power (green above base, red below) */
  power?: number;
  /** duel: queued-not-revealed (pending) or too expensive this turn (unaffordable) */
  state?: 'pending' | 'unaffordable';
  /** Who's this?: photos-off face with "?" for the letter and "? ? ?" for the name */
  mystery?: boolean;
  /** tap handler for interactive cards (taps and drags are told apart inside the card) */
  onPress?: () => void;
}

export function SnapCard(props: SnapCardProps) {
  const { card, width, look = BASE_LOOK, collected, competition = '', loadPhoto = true, power, state, mystery } = props;
  const size = resolveSize(props.size, width);
  const w = width ?? CARD[size];
  const art = useArt(card.id, loadPhoto && !mystery);
  const season = props.season ?? seasonLabel();
  const live = size === 'full' && (props.interactive || props.idleShimmer || props.flipped !== undefined);
  const label = `${card.name}, ${RARITY_NAME[card.rarity]} card, cost ${cardStats(card).cost}, power ${power ?? cardStats(card).power}${collected === false ? ', not collected' : ''}`;
  if (!live) {
    return (
      <View style={{ width: w, height: cardHeight(w), opacity: state === 'pending' ? 0.75 : 1 }} accessible accessibilityLabel={mystery ? 'Mystery card' : label} pointerEvents="none">
        <Face card={card} w={w} size={size} look={look} art={art} collected={collected} competition={competition} season={season} power={power} state={state} mystery={mystery} />
        {size === 'full' ? <TraitText card={card} w={w} look={look} dim={collected === false} /> : null}
      </View>
    );
  }
  return <LiveCard {...props} w={w} art={art} season={season} label={mystery ? 'Mystery card' : label} />;
}

function TraitText({ card, w, look, dim }: { card: PlayerCard; w: number; look: Look; dim?: boolean }) {
  if (faceStats(card)) return null;
  const trait = card.abilities.find((a) => a.kind === 'trait') ?? card.abilities[0];
  if (!trait) return null;
  const u = (n: number) => (n * w) / 100;
  const m = cardMetal[look.tier === 6 ? 'legend' : card.rarity];
  return (
    <Text
      pointerEvents="none"
      numberOfLines={2}
      style={{ position: 'absolute', top: u(113.75), left: u(12), right: u(12), textAlign: 'center', fontFamily: font.medium, fontSize: u(3.7), lineHeight: u(4.81), color: m.stat, opacity: dim ? 0.85 : 1 }}
    >
      {trait.text}
    </Text>
  );
}

function LiveCard({ card, w, art, season, label, look = BASE_LOOK, flipped = false, interactive = false, idleShimmer = false, collected, competition = '', mystery, onPress }: SnapCardProps & { w: number; art: Art | null; season: string; label: string }) {
  const H = cardHeight(w);
  const reduced = useReducedMotion();
  const mx = useSharedValue(30);
  const my = useSharedValue(50);
  const touching = useSharedValue(0);
  const flip = useSharedValue(flipped ? 1 : 0);
  const animate = (interactive || idleShimmer) && !reduced && collected !== false;
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  const idle = () => {
    if (!animate) return;
    mx.value = withRepeat(withSequence(withTiming(76, { duration: motion.sheenIdle / 2, easing: Easing.inOut(Easing.sin) }), withTiming(24, { duration: motion.sheenIdle / 2, easing: Easing.inOut(Easing.sin) })), -1);
    my.value = withRepeat(withSequence(withTiming(62, { duration: motion.sheenIdle / 2, easing: Easing.inOut(Easing.sin) }), withTiming(38, { duration: motion.sheenIdle / 2, easing: Easing.inOut(Easing.sin) })), -1);
  };
  useEffect(() => {
    if (animate) {
      mx.value = 24;
      my.value = 38;
      idle();
    } else {
      mx.value = 30;
      my.value = 50;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  useEffect(() => {
    flip.value = reduced ? withTiming(flipped ? 1 : 0, { duration: motion.base }) : withTiming(flipped ? 1 : 0, { duration: motion.flip, easing: Easing.bezier(...motion.easeInOut) });
  }, [flipped, reduced, flip]);

  // gyroscope tilt on phones
  useEffect(() => {
    if (!interactive || reduced || Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    DeviceMotion.isAvailableAsync().then((ok) => {
      if (!ok) return;
      DeviceMotion.setUpdateInterval(33);
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation || touching.value) return;
        mx.value = withTiming(50 + Math.max(-1, Math.min(1, rotation.gamma / 0.6)) * 45, { duration: 90 });
        my.value = withTiming(50 + Math.max(-1, Math.min(1, (rotation.beta - 0.7) / 0.6)) * 45, { duration: 90 });
      });
    });
    return () => sub?.remove();
  }, [interactive, reduced, mx, my, touching]);

  const tiltOn = interactive && !reduced;
  const tilt = useAnimatedStyle(() => {
    const ry = Math.max(-motion.tiltMaxDeg, Math.min(motion.tiltMaxDeg, (mx.value - 50) * 0.2));
    const rx = Math.max(-motion.tiltMaxDeg, Math.min(motion.tiltMaxDeg, (50 - my.value) * 0.2));
    return { transform: [{ perspective: 1100 }, { rotateY: `${tiltOn ? ry : 0}deg` }, { rotateX: `${tiltOn ? rx : 0}deg` }] };
  });
  const front = useAnimatedStyle(() =>
    reduced ? { opacity: 1 - flip.value } : { transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }], opacity: flip.value < 0.5 ? 1 : 0 }
  );
  const backS = useAnimatedStyle(() =>
    reduced ? { opacity: flip.value } : { transform: [{ perspective: 1100 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }], opacity: flip.value >= 0.5 ? 1 : 0 }
  );

  const responders = interactive
    ? {
        onStartShouldSetResponder: () => !!onPress,
        onMoveShouldSetResponder: () => true,
        onResponderGrant: (e: { nativeEvent: { locationX: number; locationY: number } }) => {
          start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, t: Date.now() };
        },
        onResponderMove: (e: { nativeEvent: { locationX: number; locationY: number } }) => {
          if (reduced) return;
          touching.value = 1;
          mx.value = Math.max(0, Math.min(100, (e.nativeEvent.locationX / w) * 100));
          my.value = Math.max(0, Math.min(100, (e.nativeEvent.locationY / H) * 100));
        },
        onResponderRelease: (e: { nativeEvent: { locationX: number; locationY: number } }) => {
          const s = start.current;
          const moved = s ? Math.hypot(e.nativeEvent.locationX - s.x, e.nativeEvent.locationY - s.y) : 99;
          if (onPress && moved < 8) onPress();
          touching.value = 0;
          if (reduced) return;
          if (animate) idle();
          else {
            mx.value = withSpring(30, motion.spring);
            my.value = withSpring(50, motion.spring);
          }
        },
        onResponderTerminationRequest: () => true,
      }
    : {};

  return (
    <Animated.View
      style={[{ width: w, height: H }, tilt]}
      {...responders}
      accessible
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityHint={onPress ? 'Flips the card' : undefined}
    >
      <Animated.View style={[StyleSheet.absoluteFill, front, { backfaceVisibility: 'hidden' }]} pointerEvents="none">
        <Face card={card} w={w} size="full" look={look} art={art} collected={collected} competition={competition} season={season} mystery={mystery} sheenX={mx} />
        <TraitText card={card} w={w} look={look} dim={collected === false} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, backS, { backfaceVisibility: 'hidden' }]} pointerEvents="none">
        <BackFace card={card} w={w} look={look} art={mystery ? null : art} competition={competition} season={season} />
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// the face-down card (packs) and the photo credit
// ---------------------------------------------------------------------------

/** Card back: graphite rim (or gold for the pack sleeve), engraved rings, the FootSnap mark. */
export function CardBack({ width, rim = 'graphite', title, subtitle }: { width: number; rim?: 'graphite' | 'gold'; title?: string; subtitle?: string }) {
  const uid = 'b' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const w = width;
  const H = w * CARD_RATIO;
  const u = (n: number) => (n * w) / 100;
  const stops = rim === 'gold' ? metal.elite.rim : { colors: metal.rare.rim.colors.map((c) => darken(c, 0.6)) as [string, string, ...string[]], locations: metal.rare.rim.locations };
  const paths = useMemo(() => ({ outer: cardPath(w, 0, 6), face: cardPath(w, 7, 4), hair: cardPath(w, 11.5, 3) }), [w]);
  const mw = u(18);
  const mh = mw * CARD_RATIO;
  const my = title ? u(44) : u(58);
  const pad = u(5);
  return (
    <View style={{ width: w, height: cardHeight(w) }} pointerEvents="none">
      <Svg width={w + pad * 2} height={H + pad * 2} viewBox={`${-pad} ${-pad} ${w + pad * 2} ${H + pad * 2}`} style={{ position: 'absolute', left: -pad, top: -pad }}>
        <Defs>
          <LG id={`${uid}rim`} x1="0" y1="0" x2="1" y2="1">
            {stops.colors.map((c, i) => (
              <Stop key={i} offset={stops.locations[i]} stopColor={c} />
            ))}
          </LG>
          <ClipPath id={`${uid}face`}>
            <Path d={paths.face} />
          </ClipPath>
          <RG id={`${uid}glow`}>
            <Stop offset="0" stopColor="#F0C46E" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#F0C46E" stopOpacity={0} />
          </RG>
        </Defs>
        <Path d={paths.outer} fill="#000" opacity={0.4} transform={`translate(0 ${u(1.8)})`} />
        <Path d={paths.outer} fill={`url(#${uid}rim)`} />
        <Path d={paths.outer} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
        <G clipPath={`url(#${uid}face)`}>
          <Rect x={0} y={0} width={w} height={H} fill="#0E0E12" />
          <Rect x={u(-20)} y={my - u(70)} width={u(140)} height={u(140)} fill={`url(#${uid}glow)`} />
          <Path d={concentric(u(50), my, u(95), u(w > 150 ? 1.6 : 2.4))} stroke="#FFFFFF" strokeOpacity={0.05} strokeWidth={u(0.3)} fill="none" />
        </G>
        <Path d={paths.hair} fill="none" stroke={`url(#${uid}rim)`} strokeOpacity={0.55} strokeWidth={0.8} />
        <Path d={paths.face} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={1} />
        <Path d={cardPath(mw, 0, 6)} transform={`translate(${u(50) - mw / 2} ${my - mh / 2})`} fill="#0E0E12" stroke="#E9C46A" strokeWidth={Math.max(0.6, u(0.5))} />
        <SvgText x={u(50) + u(0.5)} y={my + mh / 2 + u(8)} fontSize={u(4.4)} fontFamily={font.cardHeavy} letterSpacing={u(1.06)} textAnchor="middle" fill="#E9C46A">
          FOOTSNAP
        </SvgText>
        {title ? (
          <SvgText x={u(50) + u(0.6)} y={u(96)} fontSize={u(5.4)} fontFamily={font.semibold} letterSpacing={u(1.1)} textAnchor="middle" fill="#F4F4F6">
            {title.toUpperCase()}
          </SvgText>
        ) : null}
        {subtitle ? (
          <SvgText x={u(50) + u(0.5)} y={u(104)} fontSize={u(3.6)} fontFamily={font.semibold} letterSpacing={u(0.9)} textAnchor="middle" fill="#E9C46A" opacity={0.85}>
            {subtitle.toUpperCase()}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

/** Credit line for the card's photo (licence requirement): photographer, licence, link to the original. */
export function PhotoCredit({ card }: { card: PlayerCard }) {
  const art = useArt(card.id);
  if (!art) return null;
  return (
    <Pressable onPress={() => Linking.openURL(art.page)} accessibilityRole="link" hitSlop={8}>
      <Text style={styles.credit} numberOfLines={2}>
        Photo: {art.artist} · {art.license} · Wikimedia Commons (edited) ↗
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  credit: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: color.text3, textDecorationLine: 'underline', textAlign: 'center', maxWidth: 320 },
});
