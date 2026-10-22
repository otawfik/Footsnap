/**
 * The Duel board. Three zones, six turns, the AI manager across the pitch.
 * Tap a card in your hand, then a zone to play it; tap a queued card to take it
 * back. End the turn and both sides reveal, one card at a time. All the rules
 * live in lib/game.ts; this screen only shows them.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Image, useWindowDimensions, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring, useReducedMotion, FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { FRAME_END, FRAME_START, KitArt, RARITY_FRAME, SnapCard } from '../components/SnapCard';
import Svg, { Defs, LinearGradient as SvgGrad, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Button, Coin, tap } from '../components/ui';
import { useLeague } from '../context/league';
import { useCollection, useProfile } from '../lib/storage';
import { getMatch } from '../lib/decks';
import { lookOf } from '../lib/collection';
import { useArt } from '../lib/art';
import {
  canSnap,
  cardPower,
  cardStats,
  CONDITIONS,
  endTurn,
  energyLeft,
  GameState,
  legalPlays,
  newGame,
  Placed,
  play,
  result,
  retreat,
  snap,
  TURNS,
  unplay,
  Zone,
  ZONE_NAME,
  ZONES,
  zoneCondition,
  zonePower,
} from '../lib/game';
import type { PlayerCard } from '../lib/cards';
import { bannerName } from '../lib/cards';
import { alpha, mix } from '../lib/colors';
import { C, F, R, S, T } from '../constants/theme';

/** A card on the board: a miniature of the full card (metal frame, studio backdrop, art) with its current Power. */
function BoardCard({ card, power, pending, w, onPress }: { card: PlayerCard; power: number; pending?: boolean; w: number; onPress?: () => void }) {
  const art = useArt(card.id);
  const h = Math.round(w * 1.42);
  const f = 2;
  const iw = w - f * 2;
  const ih = h - f * 2;
  const base = cardStats(card).power;
  const primary = card.team.colors.primary;
  // the Power shield: orange as printed, green when boosted, red when cut
  const [top, bottom] = power > base ? ['#7FE0A0', '#1F8A47'] : power < base ? ['#FF8A7A', '#B3261E'] : ['#FFC15A', '#C4520F'];
  const sw = Math.max(18, w * 0.34);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[{ width: w, height: h }, pending && styles.bcPending]}
      accessibilityLabel={`${card.name}, ${power} power${pending ? ', not revealed yet. Tap to take back' : ''}`}
    >
      <LinearGradient colors={RARITY_FRAME[card.rarity]} start={FRAME_START} end={FRAME_END} style={[StyleSheet.absoluteFill, { borderRadius: 6, borderWidth: 1, borderColor: 'rgba(10,14,11,0.7)' }]} />
      <View style={{ position: 'absolute', left: f, top: f, width: iw, height: ih, borderRadius: 4, overflow: 'hidden' }}>
        <LinearGradient colors={art ? [mix(primary, '#FFFFFF', 0.08), primary, mix(primary, C.night, 0.7)] : [mix(primary, C.night, 0.55), mix(primary, C.night, 0.8)]} style={StyleSheet.absoluteFill} />
        {art ? (
          <Image source={{ uri: art.src }} style={{ position: 'absolute', width: iw * 1.15, height: iw * 1.53, left: -iw * 0.075, top: -art.headTop * iw * 1.53 + ih * 0.05 }} resizeMode="cover" />
        ) : (
          <View style={{ position: 'absolute', left: 0, top: -ih * 0.04 }}>
            <KitArt card={card} w={iw} h={ih} />
          </View>
        )}
        <LinearGradient colors={['rgba(10,14,11,0)', 'rgba(10,14,11,0.55)']} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
        {/* whose card this is, at a glance */}
        <View style={styles.bcName}>
          <Text style={styles.bcNameText} numberOfLines={1}>{bannerName(card.name, 9).toUpperCase()}</Text>
        </View>
      </View>
      <Svg width={sw} height={sw * 1.1} style={{ position: 'absolute', right: -sw * 0.18, bottom: -sw * 0.18 }} pointerEvents="none">
        <Defs>
          <SvgGrad id={`bcp${card.id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </SvgGrad>
        </Defs>
        <Path
          d={`M ${sw * 0.5} 1.5 L ${sw - 2} ${sw * 0.18} L ${sw - 2} ${sw * 0.58} Q ${sw - 2} ${sw * 0.9} ${sw * 0.5} ${sw * 1.08} Q 2 ${sw * 0.9} 2 ${sw * 0.58} L 2 ${sw * 0.18} Z`}
          fill={`url(#bcp${card.id})`}
          stroke={C.night}
          strokeWidth={1.5}
        />
        <SvgText x={sw / 2} y={sw * 0.52 + sw * 0.2} fontSize={sw * 0.52} fontFamily={F.numBlack} fill="none" stroke={C.night} strokeWidth={2.5} strokeLinejoin="round" textAnchor="middle">
          {power}
        </SvgText>
        <SvgText x={sw / 2} y={sw * 0.52 + sw * 0.2} fontSize={sw * 0.52} fontFamily={F.numBlack} fill="#FFFFFF" textAnchor="middle">
          {power}
        </SvgText>
      </Svg>
    </Pressable>
  );
}

function ZoneTile({ s, zone, selected, onPress, w }: { s: GameState; zone: Zone; selected: boolean; onPress: () => void; w: number }) {
  const cond = zoneCondition(s, zone);
  const mine = zonePower(s, zone, 'you');
  const theirs = zonePower(s, zone, 'opponent');
  const lead = mine > theirs ? 'you' : theirs > mine ? 'opponent' : 'tie';
  const pulse = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) pulse.value = withSequence(withTiming(1.12, { duration: 140 }), withSpring(1));
  }, [mine, theirs, reduced, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Pressable onPress={onPress} style={[styles.zone, { width: w }, selected && styles.zoneTarget]} accessibilityRole="button" accessibilityLabel={`${ZONE_NAME[zone]}: you ${mine}, opponent ${theirs}${cond ? `. ${CONDITIONS[cond].name}: ${CONDITIONS[cond].text}` : ''}`}>
      <Animated.View style={[styles.zonePower, lead === 'opponent' && styles.zonePowerLead, pulseStyle]}>
        <Text style={[styles.zonePowerText, lead === 'opponent' && { color: C.night }]}>{theirs}</Text>
      </Animated.View>
      <Text style={styles.zoneName}>{ZONE_NAME[zone].toUpperCase()}</Text>
      {cond ? (
        <>
          <Text style={styles.condName} numberOfLines={1}>{CONDITIONS[cond].name}</Text>
          <Text style={styles.condText} numberOfLines={3}>{CONDITIONS[cond].text}</Text>
        </>
      ) : (
        <Text style={styles.condText}>Reveals turn {zone + 1}</Text>
      )}
      <Animated.View style={[styles.zonePower, lead === 'you' && styles.zonePowerMine, pulseStyle]}>
        <Text style={[styles.zonePowerText, lead === 'you' && { color: C.night }]}>{mine}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Slots({ items, w, colW, onPressPending }: { items: { card: PlayerCard; power: number; pending: boolean }[]; w: number; colW: number; onPressPending: (id: number) => void }) {
  return (
    <View style={[styles.slots, { width: colW, minHeight: Math.round(w * 1.42) * 2 + 4 }]}>
      {items.map((it) => (
        <BoardCard key={it.card.id} card={it.card} power={it.power} pending={it.pending} w={w} onPress={it.pending ? () => onPressPending(it.card.id) : undefined} />
      ))}
    </View>
  );
}

export default function Arena() {
  const { league } = useLeague();
  const match = useMemo(() => getMatch(), []);
  const [collection] = useCollection();
  const [, setProfile] = useProfile();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [s, setS] = useState<GameState | null>(() => (match ? newGame({ you: match.you, opponent: match.opponent, seed: match.seed }) : null));
  const [selected, setSelected] = useState<number | null>(null);
  const [ticker, setTicker] = useState<string[]>([]);
  const [revealing, setRevealing] = useState(false);
  const [confirmRetreat, setConfirmRetreat] = useState(false);
  const paid = useRef(false);
  const owned = collection[String(league.id)] ?? {};

  useEffect(() => {
    if (!match) router.replace('/duel');
  }, [match]);

  const W = Math.min(width, 520);
  const colW = Math.floor((W - S.md * 2 - S.sm * 2) / 3);
  const cardW = Math.floor((colW - 4) / 2);
  const legal = useMemo(() => (s ? legalPlays(s, 'you') : []), [s]);
  const zonesFor = (id: number | null) => new Set(legal.filter((p) => p.cardId === id).map((p) => p.zone));
  const targets = zonesFor(selected);

  // pay out once per finished game
  useEffect(() => {
    if (!s?.over || paid.current) return;
    paid.current = true;
    const r = result(s);
    const won = r.winner === 'you';
    setProfile((p) => {
      const d = p.duel ?? { played: 0, won: 0, drawn: 0, best: 0 };
      return {
        ...p,
        credits: p.credits + (won ? r.stakes * 10 : 0),
        duel: { played: d.played + 1, won: d.won + (won ? 1 : 0), drawn: d.drawn + (r.winner === 'draw' ? 1 : 0), best: Math.max(d.best, won ? r.stakes : 0) },
      };
    });
  }, [s, setProfile]);

  if (!s || !match) return <View style={styles.wrap} />;

  const res = s.over ? result(s) : null;
  const items = (zone: Zone, who: 'you' | 'opponent') => [
    ...s.zones[zone][who].map((p: Placed) => ({ card: p.card, power: cardPower(s, p), pending: false })),
    ...(who === 'you' ? s.pending.you.filter((p) => p.zone === zone).map((p) => ({ card: p.card, power: cardStats(p.card).power, pending: true })) : []),
  ];

  const onZone = (zone: Zone) => {
    if (selected === null || revealing) return;
    if (!targets.has(zone)) {
      tap('light');
      return;
    }
    tap('medium');
    setS(play(s, 'you', selected, zone));
    setSelected(null);
  };

  const onEnd = async () => {
    if (revealing) return;
    tap('heavy');
    setSelected(null);
    const next = endTurn(s);
    const fresh = next.log.slice(s.log.length);
    setRevealing(true);
    setS(next);
    if (reduced) setTicker(fresh.slice(-4));
    else {
      for (let i = 0; i < fresh.length; i++) {
        setTicker(fresh.slice(Math.max(0, i - 3), i + 1));
        await new Promise((r) => setTimeout(r, 520));
      }
    }
    setRevealing(false);
    if (next.over && Platform.OS !== 'web') {
      const r = result(next);
      Haptics.notificationAsync(r.winner === 'you' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const onSnap = () => {
    if (!canSnap(s, 'you') || revealing) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setS(snap(s, 'you'));
    setTicker((t) => [...t.slice(-3), `You pressed: stakes go to ${s.stakes * 2} when this turn ends.`]);
  };

  const onRetreat = () => {
    if (revealing) return;
    if (!confirmRetreat) {
      setConfirmRetreat(true);
      setTimeout(() => setConfirmRetreat(false), 2500);
      return;
    }
    tap('heavy');
    setS(retreat(s, 'you'));
  };

  const energy = energyLeft(s, 'you');
  const selectedCard = selected !== null ? s.hands.you.find((c) => c.id === selected) : undefined;
  const selectedEffect = selectedCard ? cardStats(selectedCard).effect?.text : undefined;
  const snapPending = s.snapsThisTurn.length ? s.stakes * 2 ** s.snapsThisTurn.length : null;

  return (
    <SafeAreaView style={styles.wrap}>
      <LinearGradient colors={['#13261A', C.night, '#0D1A12']} style={StyleSheet.absoluteFill} />
      {/* top bar */}
      <View style={[styles.top, { width: W }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Leave">
          <Ionicons name="close" size={24} color={C.chalk2} />
        </Pressable>
        <Text style={styles.turn}>TURN {s.turn}/{TURNS}</Text>
        <View style={styles.stakes}>
          <Text style={styles.stakesLabel}>STAKES</Text>
          <Text style={styles.stakesNum}>{s.stakes}{snapPending ? `→${snapPending}` : ''}</Text>
        </View>
        <Pressable onPress={onSnap} disabled={!canSnap(s, 'you') || s.over} style={[styles.snap, (!canSnap(s, 'you') || s.over) && { opacity: 0.35 }]} accessibilityRole="button" accessibilityLabel="Press: double the stakes">
          <Ionicons name="flash" size={16} color={C.night} />
          <Text style={styles.snapText}>PRESS</Text>
        </Pressable>
        <Pressable onPress={onRetreat} disabled={s.over} style={[styles.retreat, confirmRetreat && { backgroundColor: C.loss }]} accessibilityRole="button" accessibilityLabel="Retreat">
          <Ionicons name="flag" size={15} color={confirmRetreat ? C.night : C.chalk2} />
        </Pressable>
      </View>
      {confirmRetreat ? <Text style={styles.confirm}>Tap the flag again to retreat and lose {s.stakes}</Text> : null}

      {/* board */}
      <View style={[styles.board, { width: W }]}>
        <View style={styles.row}>
          {ZONES.map((z) => (
            <Slots key={`o${z}`} items={items(z, 'opponent')} w={cardW} colW={colW} onPressPending={() => {}} />
          ))}
        </View>
        <View style={styles.row}>
          {ZONES.map((z) => (
            <ZoneTile key={z} s={s} zone={z} w={colW} selected={targets.has(z)} onPress={() => onZone(z)} />
          ))}
        </View>
        <View style={styles.row}>
          {ZONES.map((z) => (
            <Pressable key={`y${z}`} onPress={() => onZone(z)} disabled={!targets.has(z)}>
              <Slots
                items={items(z, 'you')}
                w={cardW}
                colW={colW}
                onPressPending={(id) => {
                  tap('light');
                  setS(unplay(s, 'you', id));
                }}
              />
            </Pressable>
          ))}
        </View>
      </View>

      {/* play-by-play */}
      <View style={[styles.ticker, { width: W - S.md * 2 }]}>
        {(res && !revealing ? [] : ticker).map((line, i) => (
          <Animated.Text key={`${s.log.length}-${i}-${line}`} entering={reduced ? undefined : FadeInDown.duration(220)} style={[styles.tickerText, i === ticker.length - 1 && { color: C.chalk }]} numberOfLines={1}>
            {line}
          </Animated.Text>
        ))}
      </View>

      {/* hand and controls */}
      <View style={[styles.controls, { width: W }]}>
        <View style={styles.energy}>
          <Text style={styles.energyNum}>{energy}</Text>
          <Text style={styles.energyLabel}>ENERGY</Text>
        </View>
        <Text style={[T.small, { flex: 1 }]} numberOfLines={3}>
          {s.over ? 'Full time.' : selected !== null ? `Now tap a highlighted zone.${selectedEffect ? ` ${selectedEffect}` : ''}` : s.hands.you.length ? 'Tap a card to play it.' : 'No cards in hand.'}
        </Text>
        <Button label={revealing ? 'Revealing…' : s.turn === TURNS ? 'Final whistle' : 'End turn'} onPress={onEnd} disabled={revealing || s.over} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hand} style={{ maxHeight: 150, width: W }}>
        {s.hands.you.map((c) => {
          const can = zonesFor(c.id).size > 0;
          const on = selected === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => {
                if (!can || revealing) return tap('light');
                tap('select');
                setSelected(on ? null : c.id);
              }}
              style={{ opacity: can ? 1 : 0.4, transform: [{ translateY: on ? -14 : 0 }] }}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: !can }}
              accessibilityLabel={`${c.name}, cost ${cardStats(c).cost}, power ${cardStats(c).power}. ${cardStats(c).effect?.text ?? ''}`}
            >
              <SnapCard card={c} width={84} look={lookOf(owned[String(c.id)])} competition={league.name} />
            </Pressable>
          );
        })}
      </ScrollView>

      {/* full time */}
      {res && !revealing ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(300)} style={styles.over}>
          <Text style={[styles.overTitle, { color: res.winner === 'you' ? C.icon : res.winner === 'draw' ? C.chalk : C.loss }]}>
            {res.retreated === 'you' ? 'RETREATED' : res.retreated === 'opponent' ? 'THEY FOLDED' : res.winner === 'you' ? 'VICTORY' : res.winner === 'draw' ? 'DRAW' : 'DEFEAT'}
          </Text>
          <Text style={T.body}>
            Zones {res.zonesWon.you}–{res.zonesWon.opponent} · Power {res.power.you}–{res.power.opponent} · Stakes {res.stakes}
          </Text>
          {res.winner === 'you' ? (
            <View style={styles.reward}>
              <Coin size={18} />
              <Text style={styles.rewardText}>+{res.stakes * 10} credits</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: S.md, marginTop: S.lg }}>
            <Button label="Back" kind="ghost" onPress={() => router.back()} />
            <Button
              label="Rematch"
              icon="refresh"
              onPress={() => {
                paid.current = false;
                setTicker([]);
                setS(newGame({ you: match.you, opponent: match.opponent, seed: (s.seed * 31 + 7) >>> 0 }));
              }}
            />
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.night, alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.md, paddingVertical: S.sm },
  turn: { fontFamily: F.label, fontSize: 14, letterSpacing: 1.6, color: C.chalk, flex: 1 },
  stakes: { flexDirection: 'row', alignItems: 'baseline', gap: 5, backgroundColor: alpha(C.icon, 0.12), borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 },
  stakesLabel: { fontFamily: F.label, fontSize: 10, letterSpacing: 1.2, color: C.icon },
  stakesNum: { fontFamily: F.numHeavy, fontSize: 18, color: C.icon },
  snap: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.flare, borderRadius: R.sm, paddingHorizontal: 9, paddingVertical: 6 },
  snapText: { fontFamily: F.label, fontSize: 13, letterSpacing: 1.2, color: C.night },
  retreat: { borderWidth: 1, borderColor: C.lineHi, borderRadius: R.sm, padding: 6 },
  confirm: { fontFamily: F.label, fontSize: 12, letterSpacing: 0.8, color: C.loss },
  board: { paddingHorizontal: S.md, gap: S.sm },
  row: { flexDirection: 'row', gap: S.sm, justifyContent: 'space-between' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignContent: 'center', justifyContent: 'center' },
  bcPending: { opacity: 0.55 },
  bcName: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,14,11,0.75)', paddingVertical: 1, paddingRight: 10 },
  bcNameText: { fontFamily: F.label, fontSize: 9, letterSpacing: 0.4, color: C.chalk, textAlign: 'center' },
  zone: { minHeight: 112, borderRadius: R.md, borderWidth: 1, borderColor: C.lineHi, backgroundColor: 'rgba(243,241,231,0.04)', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 4 },
  zoneTarget: { borderColor: C.flare, borderWidth: 2, backgroundColor: alpha(C.flare, 0.1) },
  zoneName: { fontFamily: F.label, fontSize: 11, letterSpacing: 1.3, color: C.chalk2 },
  condName: { fontFamily: F.label, fontSize: 12, color: C.chalk, textAlign: 'center' },
  condText: { fontFamily: F.body, fontSize: 10, lineHeight: 13, color: C.muted, textAlign: 'center' },
  zonePower: { minWidth: 30, height: 26, borderRadius: 13, borderWidth: 1, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: C.night },
  zonePowerLead: { backgroundColor: C.loss, borderColor: C.loss },
  zonePowerMine: { backgroundColor: '#F2A53A', borderColor: '#F2A53A' },
  zonePowerText: { fontFamily: F.numHeavy, fontSize: 16, color: C.chalk },
  ticker: { minHeight: 64, justifyContent: 'flex-end', marginTop: 'auto', paddingTop: S.sm },
  tickerText: { fontFamily: F.body, fontSize: 12, color: C.muted, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.md, marginTop: S.xs },
  energy: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#7FC4FF' },
  energyNum: { fontFamily: F.numHeavy, fontSize: 22, color: '#FFFFFF', lineHeight: 24 },
  energyLabel: { fontFamily: F.label, fontSize: 7, letterSpacing: 1, color: '#DCEBFF' },
  // the gap leaves room for the badges and name logos that overhang each card
  hand: { gap: S.md, paddingHorizontal: S.md, paddingTop: 18, paddingBottom: S.md, alignItems: 'flex-end' },
  over: { ...StyleSheet.absoluteFillObject, zIndex: 50, elevation: 50, backgroundColor: 'rgba(5,8,6,0.93)', alignItems: 'center', justifyContent: 'center', gap: S.sm, padding: S.xl },
  overTitle: { fontFamily: F.display, fontSize: 56, letterSpacing: 2 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: S.sm },
  rewardText: { fontFamily: F.numHeavy, fontSize: 22, color: C.icon },
});
