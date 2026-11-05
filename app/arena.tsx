/**
 * The Duel board (SPEC.md §7). Three lanes, one per stadium: the AI's slots, the
 * stadium plate, your slots. The plate carries the ground's name on a band in its
 * home club's kit colours, who the home crowd cheers (+4, +6 under Wall of sound)
 * and the twist once it shows. Tap a card in your hand, then a lane to queue it; tap
 * a queued card to take it back; tap any revealed card to read it. End the turn and
 * the engine's own reveal order plays out: the AI's cards appear face down, then
 * every card lands one at a time (260 ms apart) and the numbers tick to their new
 * values. A home player landing at his own ground is the CROWD MOMENT: the band
 * flashes, the boost rises off the plate in kit colours and the phone buzzes. Under
 * reduced motion the turn lands at once and the plates that roared stay lit instead.
 * All the rules live in lib/game.ts; this screen only shows them.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Button, Sheet, tap } from '../components/ui';
import { DuelCard, EmptySlot } from '../components/duel/DuelCard';
import { CoinMark, EnergyGem, TickNumber } from '../components/duel/parts';
import { useLeague } from '../context/league';
import { useCollection, useProfile } from '../lib/storage';
import { getMatch } from '../lib/decks';
import { lookOf } from '../lib/collection';
import {
  canSnap,
  cardPower,
  cardStats,
  CREDITS_PER_PRIZE,
  crowdBoost,
  energyLeft,
  energyOf,
  GameState,
  isHome,
  legalPlays,
  maxHere,
  newGame,
  playCost,
  play,
  projectedPower,
  resolveTurn,
  result,
  retreat,
  Side,
  snap,
  TURNS,
  unplay,
  Zone,
  zoneName,
  ZONES,
  zoneTwist,
  zonePower,
} from '../lib/game';
import { TWISTS } from '../lib/stadiums';
import { ClubColors, contrast } from '../lib/colors';
import type { PlayerCard } from '../lib/cards';
import { color, CARD_RATIO, font, motion, radius, space } from '../constants/design';

const easeOut = Easing.bezier(...motion.easeOut);
const GUTTER = 16;
const LANE_GAP = 8;
const SLOT_GAP = 6;
const PLATE_H = 134;
const LANE_PAD = 6;
const HAND_W = 74;
const TOP_H = 48;
const OPP_H = 36;
const HINT_H = 62;
const ABAR_H = 16 + 50 + 12;
const REVEAL_MS = 260;
const QUEUED_MS = 520;
/** extra time a crowd moment holds the reveal */
const CROWD_MS = 520;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Mode = 'revealed' | 'pending' | 'down';
interface Item {
  key: string;
  card: PlayerCard;
  power: number;
  mode: Mode;
  side: Side;
  /** his club's kit when this is his home ground */
  home?: ClubColors;
}
/** a home crowd firing at a stadium: `key` restarts the moment */
interface Roar {
  zone: Zone;
  side: Side;
  n: number;
  key: number;
}

/** black or white, whichever reads better on a kit colour: one of them always clears 4.5:1 */
const inkOn = (bg: string) => (contrast(bg, '#FFFFFF') >= contrast(bg, '#000000') ? '#FFFFFF' : '#000000');
const homeKit = (s: GameState, zone: Zone, card: PlayerCard): ClubColors | undefined => {
  const st = s.stadiums[zone];
  const i = st.clubs.indexOf(card.team.id);
  return i < 0 ? undefined : st.colors[i];
};
type Inspect = { card: PlayerCard; side: Side; power?: number } | null;

function itemsFor(s: GameState, zone: Zone, side: Side): Item[] {
  return [
    ...s.zones[zone][side].map((p) => ({
      key: `${side}${p.card.id}`,
      card: p.card,
      power: cardPower(s, p),
      mode: 'revealed' as Mode,
      side,
      home: homeKit(s, zone, p.card),
    })),
    ...s.pending[side]
      .filter((p) => p.zone === zone)
      .map((p) => ({
        key: `${side}${p.card.id}`,
        card: p.card,
        power: cardStats(p.card).power,
        mode: (side === 'you' ? 'pending' : 'down') as Mode,
        side,
      })),
  ];
}

// ---------------------------------------------------------------- a card on the board

function Piece({ item, w, tier, onPress }: { item: Item; w: number; tier: number; onPress?: () => void }) {
  const reduced = useReducedMotion();
  const prev = useRef(item.mode);
  const sc = useSharedValue(1);
  const op = useSharedValue(1);
  useEffect(() => {
    // lands: scale 1.08 → 1 (and, for the AI's face-down cards, a quick fade up from the back)
    if (prev.current !== 'revealed' && item.mode === 'revealed' && !reduced) {
      sc.value = 1.08;
      sc.value = withTiming(1, { duration: motion.base, easing: easeOut });
      if (prev.current === 'down') {
        op.value = 0.35;
        op.value = withTiming(1, { duration: 160 });
      }
    }
    prev.current = item.mode;
  }, [item.mode, reduced, sc, op]);
  const st = useAnimatedStyle(() => ({
    transform: [{ scale: sc.value }],
    opacity: op.value,
  }));
  const base = cardStats(item.card).power;
  const label =
    item.mode === 'down'
      ? 'A face-down card, revealing now'
      : `${item.side === 'you' ? '' : "AI Manager's "}${item.card.name}, ${item.power} Power${item.power !== base ? ` (printed ${base})` : ''}${item.home ? ', with the home crowd' : ''}${item.mode === 'pending' ? '. Queued: tap to take it back' : ''}`;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(160)}>
      <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={label} hitSlop={2}>
        <Animated.View style={st}>
          <DuelCard
            card={item.card}
            size="board"
            width={w}
            power={item.power}
            state={item.mode === 'pending' ? 'pending' : undefined}
            faceDown={item.mode === 'down'}
            tier={tier}
          />
          {item.home && item.mode === 'revealed' ? (
            <View pointerEvents="none" style={[styles.homeDot, { backgroundColor: item.home.primary, borderColor: item.home.secondary }]} />
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** 2 × 2 slots. Yours fill from the plate outward (top row first); the AI's mirror that (bottom row first). */
function Slots({
  items,
  w,
  side,
  tierOf,
  onPiece,
}: {
  items: Item[];
  w: number;
  side: Side;
  tierOf: (id: number) => number;
  onPiece: (it: Item) => (() => void) | undefined;
}) {
  const order = side === 'you' ? [0, 1, 2, 3] : [2, 3, 0, 1];
  return (
    <View
      style={{
        width: w * 2 + SLOT_GAP,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SLOT_GAP,
      }}
    >
      {order.map((i) => {
        const it = items[i];
        return (
          <View key={it ? it.key : `e${i}`}>
            {it ? <Piece item={it} w={w} tier={it.side === 'you' ? tierOf(it.card.id) : 0} onPress={onPiece(it)} /> : <EmptySlot w={w} />}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- stadium plate

function ZonePlate({ s, zone, roar }: { s: GameState; zone: Zone; roar: Roar | null }) {
  const reduced = useReducedMotion();
  const st = s.stadiums[zone];
  const twist = zoneTwist(s, zone);
  const t = twist ? TWISTS[twist] : null;
  const mine = zonePower(s, zone, 'you');
  const theirs = zonePower(s, zone, 'opponent');
  const lead = mine > theirs ? 'you' : theirs > mine ? 'opponent' : 'tie';
  const plus = s.pending.you.some((p) => p.zone === zone) ? projectedPower(s, zone, 'you') - mine : 0;
  const kit = st.colors[0];
  const band = kit?.primary ?? color.raised;
  const bandInk = kit ? inkOn(band) : color.text2;
  const boost = crowdBoost(s, zone);

  // the twist flips in (rotateY, 320) when it shows; a crossfade under reduced motion
  const flip = useSharedValue(t ? 1 : 0);
  useEffect(() => {
    if (!t) {
      flip.value = 0;
      return;
    }
    flip.value = reduced ? withTiming(1, { duration: motion.base }) : withTiming(1, { duration: motion.slow, easing: easeOut });
  }, [t, reduced, flip]);
  const flipStyle = useAnimatedStyle(() =>
    reduced ? { opacity: t ? flip.value : 1 } : { transform: [{ perspective: 600 }, { rotateY: `${(1 - (t ? flip.value : 1)) * 90}deg` }] }
  );

  // the crowd moment: the band flashes and the boost rises off the plate toward the side that played
  const pulse = useSharedValue(0);
  const rise = useSharedValue(1);
  const dir = roar?.side === 'you' ? 1 : -1;
  useEffect(() => {
    if (!roar || reduced) return;
    pulse.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 640 }));
    rise.value = 0;
    rise.value = withTiming(1, { duration: 820, easing: easeOut });
  }, [roar?.key, reduced, pulse, rise]); // eslint-disable-line react-hooks/exhaustive-deps
  const flashStyle = useAnimatedStyle(() => ({ opacity: pulse.value * 0.6 }));
  const crowdStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.2 }] }));
  const riseStyle = useAnimatedStyle(() => ({ opacity: rise.value < 1 ? 1 - rise.value * rise.value * rise.value : 0, transform: [{ translateY: dir * rise.value * 46 }, { scale: 1.25 - rise.value * 0.25 }] }));

  const theirColor = lead === 'opponent' ? color.loss : lead === 'tie' ? color.text2 : color.text3;
  const myColor = lead === 'you' ? color.text : lead === 'tie' ? color.text2 : color.text3;
  const lit = !!roar && reduced; // reduced motion: the crowd line just stays lit for the step
  return (
    <View
      style={[styles.plate, roar && !reduced ? { zIndex: 5 } : null]}
      accessible
      accessibilityLabel={`${st.name}. ${st.codes.length ? `Home crowd for ${st.codes.join(' and ')}, plus ${boost}.` : 'No home side.'} AI Manager ${theirs}, you ${mine}${plus > 0 ? `, plus ${plus} queued` : ''}. ${t ? `${t.name}: ${t.text}` : `Twist shows on turn ${zone + 1}`}`}
    >
      <TickNumber value={theirs} style={[styles.plateNum, { color: theirColor }]} />
      <View style={[styles.band, { backgroundColor: band, borderColor: kit?.secondary ?? color.hairlineStrong }]}>
        <Text style={[styles.stadium, { color: bandInk }]} numberOfLines={2}>
          {st.name}
        </Text>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }, flashStyle]} />
      </View>
      <Animated.View style={[styles.crowd, lit && { backgroundColor: color.accentSoft }, crowdStyle]}>
        {st.codes.length ? (
          <Text style={styles.crowdText} numberOfLines={1}>
            {st.codes.join(' · ')}
            <Text style={{ color: color.accentText }}>{` +${boost}`}</Text>
          </Text>
        ) : (
          <Text style={[styles.crowdText, { color: color.text2, fontFamily: font.medium }]}>No home side</Text>
        )}
      </Animated.View>
      <Animated.View style={[styles.cond, flipStyle]}>
        <Text style={[styles.condName, !t && { color: color.text2, fontFamily: font.medium }]} numberOfLines={1}>
          {t ? t.name : 'Twist'}
        </Text>
        <Text style={styles.condText} numberOfLines={2}>
          {t ? t.short : `Shows on turn ${zone + 1}`}
        </Text>
      </Animated.View>
      <View style={styles.mineRow}>
        <TickNumber value={mine} style={[styles.plateNum, { color: myColor }]} />
        {plus > 0 ? <Text style={styles.plus}>+{plus}</Text> : null}
      </View>
      {roar && !reduced ? (
        <Animated.View pointerEvents="none" style={[styles.riser, dir > 0 ? { bottom: -16 } : { top: -16 }, riseStyle]}>
          <View style={[styles.riserChip, { backgroundColor: band, borderColor: kit?.secondary ?? color.text }]}>
            <Text style={[styles.riserText, { color: bandInk }]}>{`+${roar.n}`}</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- hand card

function HandCard({
  card,
  w,
  tier,
  selected,
  playable,
  onPress,
}: {
  card: PlayerCard;
  w: number;
  tier: number;
  selected: boolean;
  playable: boolean;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  const [pressed, setPressed] = useState(false);
  const lift = selected ? -12 : pressed && playable ? -4 : 0;
  useEffect(() => {
    y.value = reduced ? lift : withTiming(lift, { duration: motion.fast, easing: easeOut });
  }, [lift, reduced, y]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const s = cardStats(card);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !playable }}
      accessibilityLabel={`${card.name}, cost ${s.cost}, power ${s.power}. ${s.effect?.text ?? 'No ability.'}${playable ? '' : ' Not enough energy.'}`}
    >
      <Animated.View style={st}>
        <DuelCard card={card} size="hand" width={w} state={playable ? undefined : 'unaffordable'} selected={selected} tier={tier} />
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- the board

export default function Arena() {
  const { league } = useLeague();
  const match = useMemo(() => getMatch(), []);
  const [collection] = useCollection();
  const [, setProfile] = useProfile();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [s, setS] = useState<GameState | null>(() => (match ? newGame({ you: match.you, opponent: match.opponent, seed: match.seed, stadiums: match.stadiums }) : null));
  const [roars, setRoars] = useState<Roar[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [inspect, setInspect] = useState<Inspect>(null);
  const [note, setNote] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [retreatOpen, setRetreatOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [plateY, setPlateY] = useState<number | null>(null);
  const paid = useRef(false);
  const alive = useRef(true);
  const owned = collection[String(league.id)] ?? {};
  const tierOf = useCallback((id: number) => lookOf(owned[String(id)]).tier, [owned]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!match) router.replace('/play');
  }, [match]);

  // pay out and record once per finished game, then show the end sheet
  useEffect(() => {
    if (!s?.over || revealing) return;
    if (!paid.current) {
      paid.current = true;
      const r = result(s);
      const won = r.winner === 'you';
      if (won) tap('heavy');
      setProfile((p) => {
        const d = p.duel ?? { played: 0, won: 0, drawn: 0, best: 0 };
        return {
          ...p,
          credits: p.credits + (won ? r.prize * CREDITS_PER_PRIZE : 0),
          duel: {
            played: d.played + 1,
            won: d.won + (won ? 1 : 0),
            drawn: d.drawn + (r.winner === 'draw' ? 1 : 0),
            best: Math.max(d.best, won ? r.prize : 0),
          },
        };
      });
    }
    const t = setTimeout(() => alive.current && setEndOpen(true), reduced ? 0 : 600);
    return () => clearTimeout(t);
  }, [s, revealing, reduced, setProfile]);

  // ---- sizes: pieces are 54 on a 390 screen, smaller when the lanes or the height can't hold them
  const W = Math.min(width, 520);
  const laneW = Math.floor((W - GUTTER * 2 - LANE_GAP * 2) / 3);
  const byWidth = Math.floor((laneW - SLOT_GAP) / 2);
  const handH = Math.round(HAND_W * CARD_RATIO);
  const boardRoom = height - insets.top - Math.max(insets.bottom, 8) - TOP_H - OPP_H - HINT_H - (handH + 20) - ABAR_H;
  const byHeight = Math.floor(((boardRoom - PLATE_H - LANE_GAP * 2 - LANE_PAD * 2) / 2 - SLOT_GAP) / 2 / CARD_RATIO);
  const pw = Math.max(36, Math.min(56, byWidth, byHeight));
  const ph = Math.round(pw * CARD_RATIO);
  const slotsH = ph * 2 + SLOT_GAP;

  const legal = useMemo(() => (s && !revealing ? legalPlays(s, 'you') : []), [s, revealing]);
  const zonesFor = useCallback((id: number | null) => new Set(legal.filter((p) => p.cardId === id).map((p) => p.zone)), [legal]);
  const targets = zonesFor(selected);

  if (!s || !match) return <View style={styles.wrap} />;

  const energy = energyLeft(s, 'you');
  const selectedCard = selected !== null ? (s.hands.you.find((c) => c.id === selected) ?? null) : null;
  const pressNext = s.snapsThisTurn.length ? s.prize * 2 ** s.snapsThisTurn.length : null;
  const busy = revealing || s.over;

  const onCard = (c: PlayerCard) => {
    if (busy) return;
    setRoars([]);
    setInspect(null);
    setNote(null);
    if (selected === c.id) {
      tap('select');
      setSelected(null);
      return;
    }
    if (!zonesFor(c.id).size) {
      tap('light');
      setSelected(null);
      const cost = cardStats(c).cost;
      setNote(cost > energy ? `${c.banner} costs ${cost}. You have ${energy} energy left.` : 'Every lane is full.');
      return;
    }
    tap('select');
    setSelected(c.id);
  };

  const onZone = (zone: Zone) => {
    if (busy || selected === null || !selectedCard) return;
    if (!targets.has(zone)) {
      tap('light');
      const full = s.zones[zone].you.length + s.pending.you.filter((p) => p.zone === zone).length >= maxHere(s, zone);
      setNote(full ? `${zoneName(s, zone)} is full.` : `${selectedCard.banner} costs ${playCost(s, selectedCard, zone)} at ${zoneName(s, zone)} (Heavy pitch).`);
      return;
    }
    tap('light');
    setS(play(s, 'you', selected, zone));
    setSelected(null);
    setNote(null);
  };

  const onPiece = (it: Item): (() => void) | undefined => {
    if (it.mode === 'down') return undefined;
    if (it.mode === 'pending')
      return busy
        ? undefined
        : () => {
            tap('light');
            setS(unplay(s, 'you', it.card.id));
            setInspect(null);
          };
    return () => {
      tap('select');
      setSelected(null);
      setNote(null);
      setInspect(inspect && inspect.card.id === it.card.id && inspect.side === it.side ? null : { card: it.card, side: it.side, power: it.power });
    };
  };

  const onEnd = async () => {
    if (busy) return;
    tap('medium');
    setSelected(null);
    setInspect(null);
    setNote(null);
    setRoars([]);
    const { steps, final } = resolveTurn(s);
    const crowds = steps.filter((x) => x.kind === 'reveal' && x.crowd && x.card);
    if (!reduced && steps.length) {
      setRevealing(true);
      for (const st of steps) {
        if (!alive.current) return;
        if (st.kind === 'queued') {
          const theyPlayed = st.state.pending.opponent.length;
          const anything = theyPlayed + st.state.pending.you.length;
          if (!anything) continue;
          setS(st.state);
          setNote(
            st.state.snapsThisTurn.includes('opponent')
              ? 'AI Manager pressed. The prize doubles after this turn.'
              : theyPlayed
                ? `AI Manager plays ${theyPlayed} card${theyPlayed > 1 ? 's' : ''}.`
                : 'Revealing.'
          );
          await sleep(QUEUED_MS);
        } else {
          setS(st.state);
          setNote(niceLog(st.state.log[st.state.log.length - 1]));
          if (st.kind === 'reveal' && st.crowd && st.card) {
            // the crowd moment
            tap('medium');
            setRoars([{ zone: st.card.zone, side: st.card.side, n: crowdBoost(st.state, st.card.zone), key: Date.now() }]);
            await sleep(REVEAL_MS + CROWD_MS);
            if (alive.current) setRoars([]);
            continue;
          }
          if (st.kind === 'reveal') tap('light');
          await sleep(st.kind === 'grow' ? REVEAL_MS + 120 : REVEAL_MS);
        }
      }
      await sleep(REVEAL_MS);
      if (!alive.current) return;
    }
    setS(final);
    setRevealing(false);
    if (reduced && crowds.length) {
      // no sequence to watch: light the plates where a crowd fired and say who it cheered
      setRoars(crowds.map((x, i) => ({ zone: x.card!.zone, side: x.card!.side, n: crowdBoost(x.state, x.card!.zone), key: i })));
      // the twist that just showed is on its plate; the strip has room for one thing, the crowd
      setNote(crowdNote(final, crowds.map((x) => x.card!)));
      return;
    }
    setNote(final.over ? null : turnNote(final));
  };

  const onPress = () => {
    if (busy || !canSnap(s, 'you')) return;
    tap('medium');
    setS(snap(s, 'you'));
    setNote(`You pressed. The prize goes to ×${s.prize * 2 ** (s.snapsThisTurn.length + 1)} after this turn.`);
  };

  const onRetreat = () => {
    setRetreatOpen(false);
    tap('heavy');
    setSelected(null);
    setS(retreat(s, 'you'));
  };

  const rematch = () => {
    paid.current = false;
    setEndOpen(false);
    setSelected(null);
    setInspect(null);
    setNote(null);
    setRoars([]);
    setS(
      newGame({
        you: match.you,
        opponent: match.opponent,
        seed: (s.seed * 31 + 7) >>> 0,
        stadiums: match.stadiums,
      })
    );
  };
  const done = () => {
    setEndOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace('/play');
  };

  // ---- the hint strip: the card you're holding or reading, else what just happened, else what to do
  const shownCard = selectedCard ? { card: selectedCard, side: 'you' as Side, power: undefined } : inspect;
  const hint = shownCard ? null : (note ?? defaultHint(s, legal.length > 0, energy));

  // the centre circle sits on the plates; measured, since the board floats in the space it's given
  const plateTop = plateY ?? TOP_H + OPP_H + LANE_PAD + slotsH + LANE_GAP + PLATE_H / 2;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* the pitch: floodlit green with mowing stripes, a soft centre light, the centre circle and the halfway line */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: 12 }, (_, i) => (i % 2 ? <Rect key={`mow${i}`} x={0} y={(i * height) / 12} width={width} height={height / 12} fill="#0F2C21" /> : null))}
        <Defs>
          <RadialGradient
            id="arenaLight"
            cx="50%"
            cy={insets.top + plateTop}
            rx={260}
            ry={200}
            fx="50%"
            fy={insets.top + plateTop}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.035} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#arenaLight)" />
        <Circle cx={width / 2} cy={insets.top + plateTop} r={66} stroke="rgba(255,255,255,0.045)" strokeWidth={1} fill="none" />
        <Line x1={0} x2={width} y1={insets.top + plateTop} y2={insets.top + plateTop} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
      </Svg>

      <View style={{ width: W, flex: 1 }}>
        {/* top bar */}
        <View style={styles.top}>
          <View pointerEvents="none" style={styles.turnBox}>
            <Text style={styles.turn} accessibilityRole="header">
              {s.over ? 'Full time' : `Turn ${s.turn}`}
            </Text>
            <View style={styles.ticks} accessible accessibilityLabel={`Turn ${s.turn} of ${TURNS}`}>
              {Array.from({ length: TURNS }, (_, i) => {
                const t = i + 1;
                const bg = s.over || t < s.turn ? color.text2 : t === s.turn ? color.accentText : color.hairlineStrong;
                return <View key={t} style={[styles.tick, { backgroundColor: bg }]} />;
              })}
            </View>
          </View>
          <Pressable
            onPress={() => {
              if (busy) return;
              tap('select');
              setRetreatOpen(true);
            }}
            disabled={busy}
            style={[styles.iconBtn, busy && { opacity: 0.4 }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Retreat"
            accessibilityHint="Asks before ending the duel"
          >
            <Ionicons name="flag-outline" size={18} color={color.text2} />
          </Pressable>
          <View
            style={styles.prize}
            accessible
            accessibilityLabel={`Prize times ${s.prize}${pressNext ? `, going to times ${pressNext} after this turn` : ''}`}
          >
            <Text style={styles.prizeLabel}>Prize</Text>
            {pressNext ? <Ionicons name="flash" size={12} color={color.accentText} style={{ marginRight: -3 }} /> : null}
            <Text style={[styles.prizeNum, pressNext ? { color: color.accentText } : null]}>×{pressNext ?? s.prize}</Text>
          </View>
        </View>

        <View style={{ flex: 1, maxHeight: 40 }} />

        {/* the AI manager and the three lanes */}
        <View onLayout={(e) => setPlateY(e.nativeEvent.layout.y + OPP_H + LANE_PAD + slotsH + LANE_GAP + PLATE_H / 2)}>
          <View style={styles.opp}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>AI</Text>
            </View>
            <Text style={styles.oppName}>AI Manager</Text>
            <Text style={styles.oppMeta}>
              {' · '}
              {s.hands.opponent.length} {s.hands.opponent.length === 1 ? 'card' : 'cards'} in hand
            </Text>
            {s.snapped.opponent ? (
              <View style={styles.pressedChip}>
                <Ionicons name="flash" size={11} color={color.accentText} />
                <Text style={styles.pressedText}>Pressed</Text>
              </View>
            ) : null}
          </View>

          {/* three lanes */}
          <View style={styles.lanes}>
            {ZONES.map((z) => {
              const target = targets.has(z);
              const dim = selected !== null && !target;
              return (
                <Pressable
                  key={z}
                  onPress={() => onZone(z)}
                  disabled={selected === null}
                  style={[styles.lane, { width: laneW }, dim && { opacity: 0.45 }]}
                  accessibilityRole="button"
                  accessibilityLabel={selected !== null ? `Play at ${zoneName(s, z)}${target ? '' : ', not possible'}` : zoneName(s, z)}
                  accessibilityState={{
                    disabled: selected === null || !target,
                  }}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.018)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.018)']}
                    style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                  />
                  {target ? <View style={styles.laneTarget} pointerEvents="none" /> : null}
                  <View style={{ height: slotsH, justifyContent: 'flex-end' }}>
                    <Slots items={itemsFor(s, z, 'opponent')} w={pw} side="opponent" tierOf={tierOf} onPiece={onPiece} />
                  </View>
                  <ZonePlate s={s} zone={z} roar={roars.find((r) => r.zone === z) ?? null} />
                  <View style={{ height: slotsH }}>
                    <Slots items={itemsFor(s, z, 'you')} w={pw} side="you" tierOf={tierOf} onPiece={onPiece} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ flex: 1.4 }} />

        {/* what you're holding, what just happened, or what to do */}
        <View style={styles.hint} accessibilityLiveRegion="polite">
          {shownCard ? (
            <CardLine s={s} card={shownCard.card} side={shownCard.side} power={shownCard.power} />
          ) : (
            <Text style={styles.hintText} numberOfLines={3}>
              {hint}
            </Text>
          )}
        </View>

        {/* hand */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={[styles.hand, { minWidth: W }]}
          accessibilityLabel="Your hand"
        >
          {s.hands.you.length ? (
            s.hands.you.map((c) => (
              <HandCard
                key={c.id}
                card={c}
                w={HAND_W}
                tier={tierOf(c.id)}
                selected={selected === c.id}
                playable={!busy && zonesFor(c.id).size > 0}
                onPress={() => onCard(c)}
              />
            ))
          ) : (
            <View style={{ height: handH, justifyContent: 'center' }}>
              <Text style={styles.hintText}>{s.over ? '' : 'No cards in hand'}</Text>
            </View>
          )}
        </ScrollView>

        {/* action bar */}
        <View style={styles.abar}>
          <View style={styles.energy}>
            <EnergyGem value={energy} spent={energy === 0} />
            <View>
              <Text style={styles.energyTitle}>Energy</Text>
              <Text style={styles.energySub}>
                {energy} of {energyOf(s, 'you')} left
              </Text>
            </View>
          </View>
          <Button
            label={s.snapped.you ? 'Pressed' : 'Press'}
            kind="secondary"
            onPress={onPress}
            disabled={busy || !canSnap(s, 'you')}
            accessibilityLabel={s.snapped.you ? 'Pressed: the prize doubles' : 'Press: double the prize after this turn. Once per duel'}
          />
          <View style={{ flex: 1 }}>
            <Button label={revealing ? 'Revealing' : s.turn === TURNS ? 'Final whistle' : 'End turn'} onPress={onEnd} disabled={busy} />
          </View>
        </View>
      </View>

      {/* retreat */}
      <Sheet visible={retreatOpen} onClose={() => setRetreatOpen(false)} title={`Retreat and lose ×${s.prize}?`}>
        <Text style={styles.sheetBody}>The AI Manager takes this duel and it goes down as a loss. Your credits stay as they are.</Text>
        <View style={styles.sheetButtons}>
          <Button label="Keep playing" onPress={() => setRetreatOpen(false)} />
          <Button label="Retreat" kind="secondary" onPress={onRetreat} />
        </View>
      </Sheet>

      {/* full time */}
      {s.over ? <EndSheet s={s} visible={endOpen} onAgain={rematch} onDone={done} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------- strip and sheets

function CardLine({ s, card, side, power }: { s: GameState; card: PlayerCard; side: Side; power?: number }) {
  const st = cardStats(card);
  const p = power ?? st.power;
  const homes = ZONES.filter((z) => isHome(s, z, card));
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={styles.cardLineTop} numberOfLines={1}>
        <Text style={{ color: color.text, fontFamily: font.semibold }}>{side === 'opponent' ? `AI · ${card.banner}` : card.banner}</Text>
        {`  ·  Cost ${st.cost}  ·  Power `}
        <Text
          style={{
            color: p > st.power ? color.win : p < st.power ? color.loss : color.text2,
            fontFamily: font.semibold,
          }}
        >
          {p}
        </Text>
      </Text>
      <Text style={styles.cardLineEffect} numberOfLines={3}>
        {st.effect ? (
          <>
            <Text style={{ color: color.accentText, fontFamily: font.semibold }}>{st.effect.title}</Text>
            {`  ${st.effect.text}`}
          </>
        ) : (
          'No ability.'
        )}
        {homes.length ? ` Home crowd +${crowdBoost(s, homes[0])} at ${zoneName(s, homes[0])}.` : ''}
      </Text>
    </View>
  );
}

function EndSheet({ s, visible, onAgain, onDone }: { s: GameState; visible: boolean; onAgain: () => void; onDone: () => void }) {
  const r = result(s);
  const won = r.winner === 'you';
  const credits = won ? r.prize * CREDITS_PER_PRIZE : 0;
  const zones = (n: number) => `${n} ${n === 1 ? 'stadium' : 'stadiums'}`;
  const title =
    r.retreated === 'you'
      ? 'You retreated'
      : r.retreated === 'opponent'
        ? 'AI Manager retreated'
        : r.winner === 'draw'
          ? 'A draw'
          : won
            ? `You won ${zones(r.zonesWon.you)}`
            : `AI Manager won ${zones(r.zonesWon.opponent)}`;
  const sub = r.retreated
    ? `Prize ×${r.prize}`
    : r.zonesWon.you === r.zonesWon.opponent
      ? `Level on stadiums · Power ${r.power.you}–${r.power.opponent} · Prize ×${r.prize}`
      : `Power ${r.power.you}–${r.power.opponent} · Prize ×${r.prize}`;
  return (
    <Sheet visible={visible} onClose={onDone} title={title}>
      <Text style={styles.sheetBody}>{sub}</Text>
      <View style={styles.minis}>
        {ZONES.map((z) => {
          const lead = r.zones[z];
          const mine = zonePower(s, z, 'you');
          const theirs = zonePower(s, z, 'opponent');
          const tone = lead === 'you' ? color.win : lead === 'opponent' ? color.loss : color.text2;
          return (
            <View
              key={z}
              style={styles.mini}
              accessible
              accessibilityLabel={`${zoneName(s, z)}: you ${mine}, AI Manager ${theirs}. ${lead === 'you' ? 'Won' : lead === 'opponent' ? 'Lost' : 'Level'}`}
            >
              <Text style={styles.zoneName} numberOfLines={2}>
                {zoneName(s, z)}
              </Text>
              <Text style={[styles.miniScore, { color: color.text }]}>
                {mine}
                <Text style={{ color: color.text3 }}>–</Text>
                {theirs}
              </Text>
              <Text style={[styles.miniTag, { color: tone }]}>{lead === 'you' ? 'Won' : lead === 'opponent' ? 'Lost' : 'Level'}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.reward}>
        {won ? <CoinMark s={18} /> : null}
        <Text
          style={[
            styles.rewardText,
            !won && {
              color: color.text2,
              fontFamily: font.medium,
              fontSize: 15,
            },
          ]}
        >
          {won ? `+${credits} credits` : r.winner === 'draw' ? 'No prize in a draw' : 'No credits this time. Nothing is taken.'}
        </Text>
      </View>
      <View style={styles.sheetButtons}>
        <Button label="Play again" onPress={onAgain} />
        <Button label="Done" kind="secondary" onPress={onDone} />
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- copy

/** The engine's log line, as the strip shows it. */
function niceLog(line: string | undefined): string {
  if (!line) return '';
  return line.replace(/^Opponent's /, 'AI · ').replace(/^Opponent /, 'AI Manager ');
}

/** What the strip says when a new turn starts: the twist that just showed, else the energy. */
function turnNote(s: GameState): string {
  const z = (s.turn - 1) as Zone;
  if (z <= 2) {
    const t = TWISTS[s.stadiums[z].twist];
    return `${zoneName(s, z)}: ${t.name}.${s.stadiums[z].twist === 'neutral' ? '' : ` ${t.text}`}`;
  }
  return `Turn ${s.turn}. ${energyOf(s, 'you')} energy to spend.`;
}

/** Who the crowds cheered this turn (reduced motion, where there's no sequence to watch). */
function crowdNote(s: GameState, cards: { side: Side; zone: Zone; id: number }[]): string {
  const name = (c: { side: Side; zone: Zone; id: number }) => {
    const p = s.zones[c.zone][c.side].find((x) => x.card.id === c.id);
    return p ? (c.side === 'you' ? p.card.banner : `AI · ${p.card.banner}`) : 'a home player';
  };
  return `Home crowd: ${cards.map((c) => `${name(c)} +${crowdBoost(s, c.zone)} at ${zoneName(s, c.zone)}`).join(', ')}.`;
}

function defaultHint(s: GameState, canPlay: boolean, energy: number): string {
  if (s.over) return 'Full time.';
  if (s.pending.you.length && !canPlay) return 'Tap a queued card to take it back, or end the turn.';
  if (canPlay) {
    if (s.turn !== 1 || s.pending.you.length) return 'Tap a card, then a stadium.';
    // turn 1: point at a home crowd if the hand has one, else at the first twist
    for (const c of s.hands.you)
      for (const z of ZONES) if (isHome(s, z, c)) return `Tap a card, then a stadium to play it. ${c.banner} gets +${crowdBoost(s, z)} from the home crowd at ${zoneName(s, z)}.`;
    const t = TWISTS[s.stadiums[0].twist];
    return `Tap a card, then a stadium to play it. ${zoneName(s, 0)}: ${t.text}`;
  }
  return energy ? 'Nothing fits this turn. End it when you are ready.' : 'Out of energy. End the turn.';
}

// ---------------------------------------------------------------- styles

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.pitch, alignItems: 'center' },
  top: {
    height: TOP_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  turn: {
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 18,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  ticks: { flexDirection: 'row', gap: 4 },
  tick: { width: 16, height: 3, borderRadius: 2 },
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: color.raised,
  },
  prizeLabel: { fontFamily: font.medium, fontSize: 12, color: color.text3 },
  prizeNum: {
    fontFamily: font.bold,
    fontSize: 15,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  opp: {
    height: OPP_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2A2A30',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontFamily: font.bold,
    fontSize: 9,
    color: color.text,
    letterSpacing: 0.3,
  },
  oppName: { fontFamily: font.semibold, fontSize: 13, color: color.text },
  oppMeta: {
    fontFamily: font.medium,
    fontSize: 13,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  pressedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
    height: 22,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
  },
  pressedText: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: color.accentText,
  },
  lanes: { flexDirection: 'row', gap: LANE_GAP, paddingHorizontal: GUTTER },
  lane: {
    borderRadius: 16,
    paddingVertical: LANE_PAD,
    alignItems: 'center',
    gap: LANE_GAP,
  },
  laneTarget: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(75,214,140,0.6)',
  },
  plate: {
    alignSelf: 'stretch',
    height: PLATE_H,
    overflow: 'visible',
    borderRadius: radius.md,
    backgroundColor: 'rgba(11,18,32,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(244,239,228,0.1)',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 5,
  },
  plateNum: { fontFamily: font.bold, fontSize: 18, lineHeight: 20 },
  band: {
    alignSelf: 'stretch',
    height: 32,
    marginHorizontal: -5,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    overflow: 'hidden',
  },
  stadium: {
    fontFamily: font.bold,
    fontSize: 9.5,
    lineHeight: 11.5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  crowd: { height: 17, paddingHorizontal: 6, borderRadius: 9, justifyContent: 'center' },
  crowdText: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: color.text, fontVariant: ['tabular-nums'] },
  riser: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  riserChip: {
    height: 30,
    minWidth: 48,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  riserText: { fontFamily: font.bold, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
  homeDot: { position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  mineRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  plus: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: color.accentText,
    fontVariant: ['tabular-nums'],
  },
  cond: { alignItems: 'center', gap: 0, alignSelf: 'stretch' },
  zoneName: {
    fontFamily: font.semibold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: color.text3,
  },
  condName: {
    fontFamily: font.semibold,
    fontSize: 12.5,
    lineHeight: 16,
    color: color.text,
  },
  condText: {
    fontFamily: font.regular,
    fontSize: 10.5,
    lineHeight: 12.5,
    color: color.text2,
    textAlign: 'center',
    minHeight: 25,
  },
  hint: {
    height: HINT_H,
    justifyContent: 'center',
    paddingHorizontal: GUTTER + 4,
  },
  hintText: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    color: color.text2,
    textAlign: 'center',
  },
  cardLineTop: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  cardLineEffect: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 16,
    color: color.text2,
    textAlign: 'center',
  },
  hand: {
    gap: 10,
    paddingHorizontal: GUTTER,
    paddingTop: 14,
    paddingBottom: 6,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  abar: {
    height: ABAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: GUTTER,
    paddingTop: 4,
  },
  energy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 2,
  },
  energyTitle: {
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 16,
    color: color.text,
  },
  energySub: {
    fontFamily: font.medium,
    fontSize: 12,
    lineHeight: 16,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  sheetBody: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
    color: color.text2,
  },
  sheetButtons: { gap: space.sm, marginTop: space.xl },
  minis: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  mini: {
    flex: 1,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  miniScore: {
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  miniTag: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16 },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: space.lg,
  },
  rewardText: {
    fontFamily: font.bold,
    fontSize: 17,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
});
