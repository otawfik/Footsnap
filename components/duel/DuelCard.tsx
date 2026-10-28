/**
 * The Duel's two small card sizes, drawn to SPEC.md §6 ("Other sizes"):
 *   hand  (≈ 74): art, Power top-left in the metal numeral, the Snap cost gem top-right
 *                 (grey when you can't afford it). No name.
 *   board (≈ 54): art only, current Power centred at the bottom (win green above the
 *                 card's base Power, loss red below). Pending cards sit at 75% with an
 *                 accent glow; `faceDown` draws the card back (the AI's queued plays).
 *
 * TEMPORARY: developer 2 owns the card (`<SnapCard size="hand" | "board" power state>`).
 * Until that lands, the Duel draws these locally with the same silhouette, metals and
 * art placement (constants/design.ts). When SnapCard ships those sizes, this file
 * becomes a thin wrapper around it (or goes away) and nothing else in the Duel changes.
 */
import React, { useId } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, LinearGradient, Mask, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { cardPath, CARD_INSET, CARD_RATIO, color, font, gem, metal, Metal } from '../../constants/design';
import { cardStats } from '../../lib/game';
import { useArt } from '../../lib/art';
import type { PlayerCard } from '../../lib/cards';
import { bannerName } from '../../lib/cards';
import { mix } from '../../lib/colors';

export type DuelCardSize = 'hand' | 'board';

interface Props {
  card: PlayerCard;
  size: DuelCardSize;
  width: number;
  /** board: the card's current Power (coloured against its base) */
  power?: number;
  /** pending: queued, not revealed; unaffordable: hand card you can't play now */
  state?: 'pending' | 'unaffordable';
  /** the back of the card (the AI's queued plays before they reveal) */
  faceDown?: boolean;
  /** Look.tier from the collection; 6 draws the Legend obsidian frame */
  tier?: number;
  /** hand: the card picked up, waiting for a zone (accent glow, full opacity) */
  selected?: boolean;
}

const metalOf = (card: PlayerCard, tier = 0): Metal => (tier >= 6 ? 'legend' : card.rarity);
const GLOW_PAD = 4;

/** the surname's first letter, for photos-off cards (keeps Ø, Ö, É…) */
const initial = (card: PlayerCard) => {
  const words = bannerName(card.name).split(/\s+/).filter(Boolean);
  return (words[words.length - 1] ?? card.name).charAt(0).toUpperCase();
};

export function DuelCard({ card, size, width: w, power, state, faceDown, tier, selected }: Props) {
  const raw = useId();
  const id = raw.replace(/[^a-zA-Z0-9]/g, '');
  const art = useArt(card.id, !faceDown);
  const m = metal[metalOf(card, tier)];
  const h = Math.round(w * CARD_RATIO);
  const pending = state === 'pending';
  const outer = cardPath(w, 0, 6);
  const face = cardPath(w, CARD_INSET.face, 5);
  const stats = cardStats(card);
  const base = stats.power;
  const shown = power ?? base;
  const club = card.team.colors.primary;

  // art placement (SPEC §6 photo table), in px
  const img = size === 'board' ? { w: 1.5 * w, x: -0.25 * w, y: -0.24 * w } : { w: 1.12 * w, x: -0.01 * w, y: -0.11 * w };
  const imgH = (img.w * 800) / 600;

  if (faceDown) return <CardBackSmall w={w} h={h} id={id} />;

  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <Svg
        width={w + GLOW_PAD * 2}
        height={h + GLOW_PAD * 2}
        style={{
          position: 'absolute',
          left: -GLOW_PAD,
          top: -GLOW_PAD,
          opacity: pending ? 0.75 : 1,
        }}
      >
        <Defs>
          <LinearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
            {m.rim.colors.map((c, i) => (
              <Stop key={i} offset={m.rim.locations[i]} stopColor={c} />
            ))}
          </LinearGradient>
          <LinearGradient id={`face${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={m.faceTop} />
            <Stop offset="0.52" stopColor={m.faceMid} />
            <Stop offset="1" stopColor={m.faceBottom} />
          </LinearGradient>
          <RadialGradient id={`halo${id}`} cx="58%" cy="27%" rx="34%" ry="32%" fx="58%" fy="27%">
            <Stop offset="0" stopColor={`rgb(${m.glow})`} stopOpacity={m.glowAlpha} />
            <Stop offset="0.45" stopColor={`rgb(${m.glow})`} stopOpacity={m.glowAlpha * 0.35} />
            <Stop offset="1" stopColor={`rgb(${m.glow})`} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`wash${id}`} cx="0%" cy="100%" rx="70%" ry="34%" fx="0%" fy="100%">
            <Stop offset="0" stopColor={club} stopOpacity={0.16} />
            <Stop offset="1" stopColor={club} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`vig${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.58" stopColor="#000" stopOpacity={0} />
            <Stop offset="0.72" stopColor="#000" stopOpacity={0.42} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.62} />
          </LinearGradient>
          <LinearGradient id={`num${id}`} x1="0" y1="0" x2="0" y2="1">
            {m.numeral.map((c, i) => (
              <Stop key={i} offset={[0, 0.46, 0.54, 1][i] ?? 1} stopColor={c} />
            ))}
          </LinearGradient>
          {/* the photo fades: in over the image's first 9% (hides the cut-out's left edge), out from 57% to 80% of its height */}
          <LinearGradient id={`fx${id}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#fff" stopOpacity={0} />
            <Stop offset="0.09" stopColor="#fff" stopOpacity={1} />
            <Stop offset="1" stopColor="#fff" stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id={`fy${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.57" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.8" stopColor="#fff" stopOpacity={0} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <Mask id={`mx${id}`} maskUnits="userSpaceOnUse" x={img.x} y={img.y} width={img.w} height={imgH}>
            <Rect x={img.x} y={img.y} width={img.w} height={imgH} fill={`url(#fx${id})`} />
          </Mask>
          <Mask id={`my${id}`} maskUnits="userSpaceOnUse" x={img.x} y={img.y} width={img.w} height={imgH}>
            <Rect x={img.x} y={img.y} width={img.w} height={imgH} fill={`url(#fy${id})`} />
          </Mask>
          <ClipPath id={`clip${id}`}>
            <Path d={face} />
          </ClipPath>
          {!art ? (
            <LinearGradient id={`sash${id}`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0.08" stopColor={club} stopOpacity={0} />
              <Stop offset="0.34" stopColor={club} stopOpacity={0.5} />
              <Stop offset="0.66" stopColor={club} stopOpacity={0.5} />
              <Stop offset="0.92" stopColor={club} stopOpacity={0} />
            </LinearGradient>
          ) : null}
        </Defs>
        <G x={GLOW_PAD} y={GLOW_PAD}>
          {pending || selected ? (
            <>
              <Path d={outer} fill="none" stroke={color.accentText} strokeOpacity={selected ? 0.3 : 0.22} strokeWidth={6} strokeLinejoin="round" />
              <Path d={outer} fill="none" stroke={color.accentText} strokeOpacity={0.9} strokeWidth={selected ? 2 : 1.6} strokeLinejoin="round" />
            </>
          ) : null}
          {/* rim */}
          <Path d={outer} fill={`url(#rim${id})`} stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
          {/* face */}
          <G clipPath={`url(#clip${id})`}>
            <Rect x={0} y={0} width={w} height={h} fill={`url(#face${id})`} />
            <Rect x={0} y={0} width={w} height={h} fill={`url(#wash${id})`} />
            <Rect x={0} y={0} width={w} height={h} fill={`url(#halo${id})`} />
            {art ? (
              <G mask={`url(#mx${id})`}>
                <SvgImage href={{ uri: art.src }} x={img.x} y={img.y} width={img.w} height={imgH} preserveAspectRatio="xMidYMin slice" mask={`url(#my${id})`} />
              </G>
            ) : (
              <G>
                {/* photos off: the kit as a diagonal sash, the surname's initial engraved over it */}
                <G rotation={-28} origin={`${w / 2}, ${w * (size === 'board' ? 0.52 : 0.55)}`}>
                  <Rect
                    x={-0.4 * w}
                    y={w * (size === 'board' ? 0.34 : 0.4)}
                    width={1.8 * w}
                    height={w * (size === 'board' ? 0.36 : 0.3)}
                    fill={`url(#sash${id})`}
                  />
                </G>
                {size === 'hand' ? (
                  <>
                    <Circle cx={0.55 * w} cy={0.5 * w} r={0.31 * w} fill={m.faceBottom} stroke={`url(#rim${id})`} strokeWidth={Math.max(1, 0.009 * w)} />
                    {[0.27, 0.22, 0.17].map((r) => (
                      <Circle key={r} cx={0.55 * w} cy={0.5 * w} r={r * w} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={0.6} />
                    ))}
                  </>
                ) : null}
                <SvgText
                  x={size === 'board' ? 0.5 * w : 0.55 * w}
                  y={size === 'board' ? 0.44 * w + 0.2 * w : 0.5 * w + 0.125 * w}
                  fontSize={size === 'board' ? 0.58 * w : 0.36 * w}
                  fontFamily={font.cardHeavy}
                  fontWeight="800"
                  textAnchor="middle"
                  fill={`url(#num${id})`}
                  opacity={size === 'board' ? 0.55 : 1}
                >
                  {initial(card)}
                </SvgText>
              </G>
            )}
            <Rect x={0} y={0} width={w} height={h} fill={`url(#vig${id})`} />
          </G>
          <Path d={face} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={1} />
          {size === 'hand' ? <HandType w={w} id={id} power={base} cost={stats.cost} grey={state === 'unaffordable'} rim={`url(#rim${id})`} /> : null}
        </G>
      </Svg>
      {size === 'board' ? (
        <Text
          style={[
            styles.boardPower,
            {
              fontSize: 0.4 * w,
              lineHeight: 0.42 * w,
              bottom: (art ? 0.12 : 0.1) * w,
              color: shown > base ? color.win : shown < base ? color.loss : '#FFFFFF',
              opacity: pending ? 0.75 : 1,
            },
          ]}
          allowFontScaling={false}
        >
          {shown}
        </Text>
      ) : null}
    </View>
  );
}

/** Power numeral and cost gem, hand size. */
function HandType({ w, id, power, cost, grey, rim }: { w: number; id: string; power: number; cost: number; grey: boolean; rim: string }) {
  const d = 0.21 * w;
  const cx = w - 0.06 * w - d / 2;
  const cy = 0.065 * w + d / 2;
  return (
    <>
      <Defs>
        <RadialGradient id={`gem${id}`} cx="34%" cy="28%" r="75%" fx="34%" fy="28%">
          {(grey
            ? [
                [0, '#6A6F7A'],
                [0.6, '#3D414A'],
                [1, '#25282E'],
              ]
            : [
                [0, gem.hi],
                [0.4, gem.mid],
                [0.74, gem.low],
                [1, gem.edge],
              ]
          ).map(([o, c]) => (
            <Stop key={String(o)} offset={o as number} stopColor={c as string} />
          ))}
        </RadialGradient>
      </Defs>
      <SvgText
        x={0.07 * w + 0.11 * w}
        y={0.07 * w + 0.2 * w}
        fontSize={0.22 * w}
        fontFamily={font.cardHeavy}
        fontWeight="800"
        textAnchor="middle"
        fill="rgba(0,0,0,0.6)"
        dy={0.006 * w}
      >
        {power}
      </SvgText>
      <SvgText
        x={0.07 * w + 0.11 * w}
        y={0.07 * w + 0.2 * w}
        fontSize={0.22 * w}
        fontFamily={font.cardHeavy}
        fontWeight="800"
        textAnchor="middle"
        fill={`url(#num${id})`}
      >
        {power}
      </SvgText>
      <Circle cx={cx} cy={cy} r={d / 2} fill={rim} />
      <Circle cx={cx} cy={cy} r={d / 2 - Math.max(1, 0.0095 * w * 1.4)} fill={`url(#gem${id})`} />
      <SvgText
        x={cx}
        y={cy + 0.042 * w}
        fontSize={0.12 * w}
        fontFamily={font.cardHeavy}
        fontWeight="800"
        textAnchor="middle"
        fill="#FFFFFF"
        fillOpacity={grey ? 0.7 : 1}
      >
        {cost}
      </SvgText>
    </>
  );
}

/** The card back at board size: a graphite rim, a dark face with engraved rings and the FootSnap mark. */
function CardBackSmall({ w, h, id }: { w: number; h: number; id: string }) {
  const rim = metal.rare.rim;
  const outer = cardPath(w, 0, 6);
  const face = cardPath(w, CARD_INSET.face, 5);
  const markW = 0.24 * w;
  return (
    <View style={{ width: w, height: h }} pointerEvents="none">
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id={`brim${id}`} x1="0" y1="0" x2="1" y2="1">
            {rim.colors.map((c, i) => (
              <Stop key={i} offset={rim.locations[i]} stopColor={mix(c, '#000000', 0.4)} />
            ))}
          </LinearGradient>
          <ClipPath id={`bclip${id}`}>
            <Path d={face} />
          </ClipPath>
        </Defs>
        <Path d={outer} fill={`url(#brim${id})`} stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
        <G clipPath={`url(#bclip${id})`}>
          <Rect x={0} y={0} width={w} height={h} fill="#0E0E12" />
          {Array.from({ length: 14 }, (_, i) => (
            <Circle key={i} cx={w / 2} cy={h / 2} r={(i + 1) * w * 0.06} fill="none" stroke="#fff" strokeOpacity={0.06} strokeWidth={0.6} />
          ))}
        </G>
        <G x={w / 2 - markW / 2} y={h / 2 - (markW * CARD_RATIO) / 2}>
          <Path d={cardPath(markW, 0, 6)} fill="none" stroke={color.gold} strokeWidth={0.8} />
        </G>
      </Svg>
    </View>
  );
}

/** An empty board slot: the card silhouette at white 2.6%, so the board always reads as a board. */
export function EmptySlot({ w }: { w: number }) {
  const h = Math.round(w * CARD_RATIO);
  return (
    <Svg width={w} height={h} pointerEvents="none">
      <Path d={cardPath(w, 0, 6)} fill="#FFFFFF" fillOpacity={0.026} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  boardPower: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: font.cardHeavy,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
