/**
 * Opening the daily pack (SPEC.md §8): a sealed sleeve, a tear across the top, five card
 * backs, then one tap per card, lowest rarity first and the best last. Each back telegraphs
 * its rarity before it turns over.
 *
 * The pack is fixed per day and competition (lib/packs.ts), and it's marked opened and added
 * to the collection the moment it's torn, so leaving halfway loses nothing.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Line, LinearGradient as LG, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SnapCard, CardBack, cardHeight } from '../components/SnapCard';
import { Button, Credits, NavBar, tap } from '../components/ui';
import { useLeague } from '../context/league';
import { useCards } from '../hooks/data';
import { drawPack, packSeed, ODDS, PACK_SIZE } from '../lib/packs';
import { useCollection, usePacks, useProfile, today } from '../lib/storage';
import { addPull, REWARDS } from '../lib/collection';
import type { PlayerCard, Rarity } from '../lib/cards';
import { RARITY_NAME } from '../lib/cards';
import { cardPath, color, font, motion, radius, space, type } from '../constants/design';

const easeOut = Easing.bezier(...motion.easeOut);
const easeInOut = Easing.bezier(...motion.easeInOut);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** "Icon 4% · Gold 12% · Silver 24% · Bronze 60%", from the odds the draw actually uses. */
const ODDS_LINE = ODDS.map(([r, p]) => `${RARITY_NAME[r]} ${Math.round(p * 100)}%`).join(' · ');
/** The tear strip: the top 12% of the sleeve. */
const STRIP = 0.12;
/** Perimeter of the card silhouette in 300-wide box units (2 chamfers, top, sides, shield). */
const PERIMETER = 260 + 2 * Math.hypot(20, 20) + 2 * 368 + 2 * Math.hypot(150, 32);

const hoursToMidnight = () => {
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((mid.getTime() - now.getTime()) / 3600000));
};

// ---------------------------------------------------------------- sealed

/** The sleeve's face with its sheen, clipped to the card silhouette so the light never spills past the rim. */
function SleeveArt({ w, title, sheen, reduced }: { w: number; title: string; sheen: SharedValue<number>; reduced: boolean }) {
  const uid = 's' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const H = cardHeight(w);
  const L = w * 1.5;
  const band = L * 0.4;
  const props = useAnimatedProps(() => ({ x: w / 2 - L / 2 - band + (reduced ? 0.3 : sheen.value) * (L + band) }));
  const face = useMemo(() => cardPath(w, 7, 4), [w]);
  const k = w / 300;
  return (
    <View style={{ width: w, height: H }}>
      <CardBack width={w} rim="gold" title={title} subtitle={`${PACK_SIZE} cards`} />
      <Svg width={w} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <ClipPath id={`${uid}c`}>
            <Path d={face} />
          </ClipPath>
          <LG id={`${uid}g`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LG>
        </Defs>
        <G clipPath={`url(#${uid}c)`}>
          <G transform={`rotate(22 ${w / 2} ${H / 2})`}>
            <AnimatedRect animatedProps={props} y={H / 2 - L} width={band} height={L * 2} fill={`url(#${uid}g)`} />
          </G>
          {/* the perforation: where the strip comes off */}
          <Line x1={14 * k} x2={w - 14 * k} y1={H * STRIP} y2={H * STRIP} stroke="#E9C46A" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 4" />
        </G>
      </Svg>
    </View>
  );
}

/** The sealed pack. Swipe across it (or press Open) to tear the strip off; `torn` drives the exit. */
function Sleeve({ w, title, torn, onTear }: { w: number; title: string; torn: boolean; onTear: () => void }) {
  const reduced = useReducedMotion();
  const H = cardHeight(w);
  const pad = Math.round(w * 0.06);
  const sheen = useSharedValue(0);
  const drag = useSharedValue(0);
  const strip = useSharedValue(0);
  const drop = useSharedValue(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return;
    // a sweep every 4 s: 1.2 s across, 2.8 s at rest
    sheen.value = withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 1200, easing: easeInOut }), withTiming(1, { duration: 2800 })), -1);
  }, [reduced, sheen]);

  useEffect(() => {
    if (!torn) return;
    if (reduced) {
      drop.value = withTiming(1, { duration: motion.base });
      return;
    }
    strip.value = withTiming(1, { duration: 220, easing: easeOut });
    drop.value = withDelay(180, withTiming(1, { duration: motion.slow, easing: easeInOut }));
  }, [torn, reduced, strip, drop]);

  const stripStyle = useAnimatedStyle(() => {
    const x = drag.value + strip.value * w * 1.1;
    return {
      opacity: reduced ? 1 : 1 - strip.value * 0.6,
      transform: [{ translateX: x }, { rotate: `${(reduced ? 0 : strip.value * 8) + drag.value * 0.02}deg` }],
    };
  });
  const bodyStyle = useAnimatedStyle(() => (reduced ? {} : { opacity: 1 - drop.value, transform: [{ translateY: drop.value * 40 }] }));
  const wholeStyle = useAnimatedStyle(() => (reduced ? { opacity: 1 - drop.value } : {}));

  const x = (e: GestureResponderEvent) => e.nativeEvent.pageX;
  const responders = torn
    ? {}
    : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderGrant: (e: GestureResponderEvent) => {
          start.current = x(e);
        },
        onResponderMove: (e: GestureResponderEvent) => {
          if (start.current === null || reduced) return;
          drag.value = Math.max(0, Math.min(w * 0.35, x(e) - start.current));
        },
        onResponderRelease: (e: GestureResponderEvent) => {
          const dx = start.current === null ? 0 : x(e) - start.current;
          start.current = null;
          if (dx > w * 0.22) onTear();
          else drag.value = withSpring(0, motion.spring);
        },
        onResponderTerminate: () => {
          start.current = null;
          drag.value = withSpring(0, motion.spring);
        },
      };

  // two clipped copies of the same art: the strip above the perforation, the body below it
  const clip = { position: 'absolute' as const, left: -pad, width: w + pad * 2, overflow: 'hidden' as const };
  return (
    <Animated.View
      style={[{ width: w, height: H }, wholeStyle]}
      {...responders}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${title} pack, ${PACK_SIZE} cards. Swipe across to open.`}
      accessibilityActions={[{ name: 'activate', label: 'Open the pack' }]}
      onAccessibilityAction={() => !torn && onTear()}
    >
      <Animated.View style={[clip, { top: H * STRIP, height: H * (1 - STRIP) + pad }, bodyStyle]} pointerEvents="none">
        <View style={{ position: 'absolute', left: pad, top: -H * STRIP }}>
          <SleeveArt w={w} title={title} sheen={sheen} reduced={reduced} />
        </View>
      </Animated.View>
      <Animated.View style={[clip, { top: -pad, height: H * STRIP + pad }, stripStyle]} pointerEvents="none">
        <View style={{ position: 'absolute', left: pad, top: pad }}>
          <SleeveArt w={w} title={title} sheen={sheen} reduced={reduced} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------- reveal

/** A face-down card waiting in the stack. The first time the stack forms, the backs rise in (stagger 60). */
function StackBack({ w, depth, delay }: { w: number; depth: number; delay: number | null }) {
  const reduced = useReducedMotion();
  const rise = useSharedValue(delay === null ? 1 : 0);
  const d = useSharedValue(depth);
  useEffect(() => {
    if (delay !== null) rise.value = reduced ? withTiming(1, { duration: motion.base }) : withDelay(delay, withTiming(1, { duration: motion.slow, easing: easeOut }));
  }, [delay, reduced, rise]);
  useEffect(() => {
    d.value = reduced ? depth : withTiming(depth, { duration: motion.base, easing: easeInOut });
  }, [depth, reduced, d]);
  const st = useAnimatedStyle(() => ({
    opacity: rise.value * (1 - d.value * 0.12),
    transform: [{ translateY: d.value * 12 + (reduced ? 0 : (1 - rise.value) * 60) }, { scale: 1 - d.value * 0.025 }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]} pointerEvents="none">
      <CardBack width={w} />
    </Animated.View>
  );
}

type Phase = 'back' | 'telegraph' | 'shown';

/**
 * The top card. Tap it: the back telegraphs the rarity (Silver a cool glint round the rim, Gold a
 * warm glow behind, Icon the stage dims and a white edge light builds), then it flips (480).
 */
function Reveal({ card, w, entering, dim, onShown, competition }: { card: PlayerCard; w: number; entering: number | null; dim: SharedValue<number>; onShown: () => void; competition: string }) {
  const uid = 'r' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduced = useReducedMotion();
  const H = cardHeight(w);
  const [phase, setPhase] = useState<Phase>('back');
  const rise = useSharedValue(entering === null ? 1 : 0);
  // the first card rises in at the front; every later one moves up from depth 1 of the stack
  const lift = useSharedValue(entering === null ? 0 : 1);
  const flip = useSharedValue(0);
  const glint = useSharedValue(0);
  const glow = useSharedValue(0);
  const edge = useSharedValue(0);
  const flash = useSharedValue(0);
  const paths = useMemo(() => ({ outer: cardPath(w, 0, 6), rim: cardPath(w, 1.5, 6) }), [w]);
  const perim = (PERIMETER * w) / 300;
  const dash = perim * 0.12;

  useEffect(() => {
    if (entering !== null) rise.value = reduced ? withTiming(1, { duration: motion.base }) : withDelay(entering, withTiming(1, { duration: motion.slow, easing: easeOut }));
    else lift.value = reduced ? 1 : withTiming(1, { duration: motion.base, easing: easeInOut });
    // mount only: `entering` is read once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turnOver = () => {
    setPhase('shown');
    onShown();
    if (card.rarity === 'icon') tap('heavy');
    if (reduced) {
      flip.value = withTiming(1, { duration: motion.base });
      dim.value = withTiming(0, { duration: motion.base });
      return;
    }
    flip.value = withTiming(1, { duration: motion.flip, easing: easeInOut });
    if (card.rarity === 'icon') {
      // one 120 ms white flash as the face comes round, then the stage lifts again
      flash.value = withDelay(motion.flip / 2, withSequence(withTiming(1, { duration: 30 }), withTiming(0, { duration: 120 })));
      edge.value = withDelay(motion.flip / 2, withTiming(0, { duration: motion.base }));
      dim.value = withDelay(motion.flip, withTiming(0, { duration: motion.slow }));
    }
    glow.value = withTiming(0, { duration: motion.slow });
  };

  const telegraph = (r: Rarity): number => {
    if (reduced) return 0; // the static label above the back stands in for it
    if (r === 'rare') {
      glint.value = 0;
      glint.value = withTiming(1, { duration: 400, easing: easeInOut });
      return 400;
    }
    if (r === 'elite') {
      glow.value = withSequence(withTiming(1, { duration: 260, easing: easeOut }), withTiming(0.45, { duration: 260, easing: easeInOut }));
      return 520;
    }
    if (r === 'icon') {
      dim.value = withTiming(1, { duration: motion.slow, easing: easeOut });
      edge.value = withTiming(1, { duration: 700, easing: Easing.in(Easing.quad) });
      return 700;
    }
    return 0;
  };

  const onPress = () => {
    if (phase !== 'back') return;
    tap('light');
    const ms = telegraph(card.rarity);
    if (!ms) return turnOver();
    setPhase('telegraph');
    setTimeout(turnOver, ms);
  };

  const wrap = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - lift.value) * 12 + (reduced ? 0 : (1 - rise.value) * 60) }, { scale: 1 - (1 - lift.value) * 0.025 }],
  }));
  const back = useAnimatedStyle(() => (reduced ? { opacity: 1 - flip.value } : { opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 1100 }, { rotateY: `${flip.value * 180}deg` }] }));
  const front = useAnimatedStyle(() => (reduced ? { opacity: flip.value } : { opacity: flip.value >= 0.5 ? 1 : 0, transform: [{ perspective: 1100 }, { rotateY: `${180 + flip.value * 180}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const glintProps = useAnimatedProps(() => ({ strokeDashoffset: perim * (1 - glint.value * 1.15), strokeOpacity: glint.value > 0 && glint.value < 1 ? 1 : 0 }));
  const edgeProps = useAnimatedProps(() => ({ strokeOpacity: edge.value, strokeWidth: 1 + edge.value * 2.5 }));
  const flashProps = useAnimatedProps(() => ({ fillOpacity: flash.value }));

  const gw = w * 1.7;
  const gh = H * 1.45;
  const teaser = reduced && phase !== 'shown' && card.rarity !== 'common';
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.teaser}>{teaser ? <Text style={type.overline}>{RARITY_NAME[card.rarity]}</Text> : null}</View>
      <Animated.View style={[{ width: w, height: H }, wrap]}>
        {/* Gold: a warm glow behind the card, pulsing once */}
        <Animated.View style={[{ position: 'absolute', left: (w - gw) / 2, top: (H - gh) / 2, width: gw, height: gh }, glowStyle]} pointerEvents="none">
          <Svg width={gw} height={gh}>
            <Defs>
              <RadialGradient id={`${uid}gl`} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0.35" stopColor="#F0C464" stopOpacity="0.4" />
                <Stop offset="1" stopColor="#F0C464" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width={gw} height={gh} fill={`url(#${uid}gl)`} />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, back, { backfaceVisibility: 'hidden' }]} pointerEvents="none">
          <CardBack width={w} />
          <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
            {/* Silver: one cool glint travelling round the rim */}
            <AnimatedPath d={paths.rim} fill="none" stroke="#E4EEFF" strokeWidth={1.6} strokeLinecap="round" strokeDasharray={`${dash} ${perim}`} animatedProps={glintProps} />
            {/* Icon: a white edge light builds */}
            <AnimatedPath d={paths.rim} fill="none" stroke="#FFFFFF" animatedProps={edgeProps} />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, front, { backfaceVisibility: 'hidden' }]}
          pointerEvents={phase === 'shown' ? 'auto' : 'none'}
          // face-down: screen readers must not read the player before the card is turned
          aria-hidden={phase !== 'shown'}
          accessibilityElementsHidden={phase !== 'shown'}
          importantForAccessibility={phase === 'shown' ? 'auto' : 'no-hide-descendants'}
        >
          {/* mounted face-down so the photo is loaded by the time it turns over */}
          <SnapCard card={card} size="full" width={w} interactive={phase === 'shown'} idleShimmer competition={competition} />
          <Svg width={w} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
            <AnimatedPath d={paths.outer} fill="#FFFFFF" animatedProps={flashProps} />
          </Svg>
        </Animated.View>
        {phase === 'shown' ? null : (
          <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityRole="button" accessibilityLabel="Turn the card over" />
        )}
      </Animated.View>
    </View>
  );
}

/** Under the revealed card: NEW, or what the duplicate paid. */
function Outcome({ isNew }: { isNew: boolean }) {
  return (
    <Animated.View entering={FadeIn.duration(motion.base)} style={styles.outcome}>
      {isNew ? (
        <View style={styles.newChip}>
          <Text style={styles.newText}>NEW</Text>
        </View>
      ) : (
        <Text style={[type.callout, { color: color.text2 }]}>{`Duplicate · +${REWARDS.duplicateCredits} credits · +${REWARDS.duplicateBoosters} boosters`}</Text>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------- the screen

export default function Pack() {
  const { league } = useLeague();
  const { list, loading } = useCards(league);
  const [collection, setCollection] = useCollection();
  const [packs, setPacks] = usePacks();
  const [profile, setProfile] = useProfile();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const day = today();
  const key = String(league.id);
  const dailyOpen = packs[key] === day;
  // milestones award bonus packs; with today's pack open, the next one is a bonus pack
  const bonus = dailyOpen && profile.bonusPacks > 0;
  const alreadyOpen = dailyOpen && !bonus;
  const seed = bonus ? packSeed(`bonus:${profile.bonusOpened ?? 0}`, league.id) : packSeed(day, league.id);
  const drawn = useMemo(() => (list.length ? drawPack(list, seed) : []), [list, seed]);
  // frozen at tear time: tearing changes the state the seed depends on
  const [frozen, setFrozen] = useState<PlayerCard[] | null>(null);
  const pack = frozen ?? drawn;
  // which cards were already owned before this pack was torn
  const before = useRef<Record<string, number> | null>(null);
  const [stage, setStage] = useState<'sealed' | 'torn' | 'reveal' | 'done'>(alreadyOpen ? 'done' : 'sealed');
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [earned, setEarned] = useState(0);
  const dim = useSharedValue(0);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.85 }));
  const sleeveW = Math.min(240, width - space.gutter * 4, (height - 330) / 1.4);
  const cardW = Math.round(Math.min(300, width - space.x4 * 2, (height - 330) / 1.4));
  const gridW = Math.floor(Math.min(110, (width - space.gutter * 2 - space.md * 2) / 3));
  const title = `${bonus ? 'Bonus · ' : ''}${league.name}`;

  const tear = () => {
    if (stage !== 'sealed' || !drawn.length) return;
    tap('medium');
    setFrozen(drawn);
    before.current = Object.fromEntries(Object.entries(collection[key] ?? {}).map(([id, st]) => [id, st.copies]));
    const mine = { ...(collection[key] ?? {}) };
    let got = REWARDS.packOpened;
    for (const card of drawn) {
      const r = addPull(mine[String(card.id)]);
      mine[String(card.id)] = r.state;
      got += r.credits;
    }
    setCollection((c) => ({ ...c, [key]: mine }));
    if (bonus) setProfile((p) => ({ ...p, bonusPacks: p.bonusPacks - 1, bonusOpened: (p.bonusOpened ?? 0) + 1, credits: p.credits + got }));
    else {
      setPacks((p) => ({ ...p, [key]: day }));
      setProfile((p) => ({ ...p, credits: p.credits + got }));
    }
    setEarned(got);
    setStage('torn');
    // the strip comes off (220), the sleeve drops and fades (320), then the backs rise
    setTimeout(() => setStage('reveal'), reduced ? motion.base : 420);
  };

  const next = () => {
    dim.value = withTiming(0, { duration: motion.fast });
    if (index + 1 >= pack.length) setStage('done');
    else {
      setIndex((i) => i + 1);
      setShown(false);
    }
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace('/cards'));
  const card = pack[index];
  const isNew = (c: PlayerCard) => !(before.current ?? {})[String(c.id)];
  const first = index === 0 && !shown; // the stack is forming: backs rise in, staggered
  const dupCredits = earned - REWARDS.packOpened;

  return (
    <View style={styles.root}>
      {/* the stage: bg with a competition-neutral gold tint */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="packStage" cx="50%" cy="44%" rx="70%" ry="45%">
            <Stop offset="0" stopColor="rgb(240,200,110)" stopOpacity="0.10" />
            <Stop offset="1" stopColor="rgb(240,200,110)" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#packStage)" />
      </Svg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space.gutter }}>
          <NavBar back="close" onBack={close} title={stage === 'reveal' ? `Card ${index + 1} of ${pack.length}` : title} right={<Credits credits={profile.credits} />} />
        </View>
        {/* Icon: the stage dims to 85% black behind the card */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, dimStyle]} pointerEvents="none" />

        {loading || !pack.length ? (
          <View style={styles.center}>
            <Text style={type.body}>Shuffling…</Text>
          </View>
        ) : stage === 'sealed' || stage === 'torn' ? (
          <View style={styles.center}>
            <Sleeve w={sleeveW} title={title} torn={stage === 'torn'} onTear={tear} />
            <View style={styles.under}>
              <Text style={[type.callout, { textAlign: 'center' }]}>Swipe across the top to open</Text>
              <Text style={[type.footnote, { textAlign: 'center', fontVariant: ['tabular-nums'] }]}>{ODDS_LINE}</Text>
            </View>
            <View style={styles.actions}>
              <Button label="Open" onPress={tear} disabled={stage !== 'sealed'} />
            </View>
          </View>
        ) : stage === 'reveal' && card ? (
          <View style={styles.center}>
            <View style={{ width: cardW, height: cardHeight(cardW) + 28 + 24 }}>
              <View style={{ position: 'absolute', top: 28, width: cardW, height: cardHeight(cardW) }}>
                {pack.slice(index + 1, index + 5).map((c, i) => (
                  <StackBack key={c.id} w={cardW} depth={i + 1} delay={first ? (pack.length - 1 - (index + 1 + i)) * 60 : null} />
                )).reverse()}
              </View>
              <View style={{ position: 'absolute', top: 0 }}>
                <Reveal
                  key={card.id}
                  card={card}
                  w={cardW}
                  entering={first ? (pack.length - 1) * 60 : null}
                  dim={dim}
                  onShown={() => setShown(true)}
                  competition={league.name}
                />
              </View>
            </View>
            <View style={styles.outcomeSlot}>{shown ? <Outcome isNew={isNew(card)} /> : <Text style={type.footnote}>Tap the card to turn it over</Text>}</View>
            <View style={styles.actions}>
              {shown ? (
                <Animated.View entering={FadeIn.duration(motion.base)}>
                  <Button label={index + 1 >= pack.length ? 'See all five' : 'Next card'} onPress={next} />
                </Animated.View>
              ) : (
                <View style={{ height: 50 }} />
              )}
            </View>
          </View>
        ) : (
          <Animated.ScrollView entering={FadeIn.duration(motion.base)} contentContainerStyle={styles.summary} showsVerticalScrollIndicator={false}>
            <Text style={[type.title, { textAlign: 'center' }]} accessibilityRole="header">
              {before.current ? 'Added to your collection' : "Today's pack"}
            </Text>
            <View style={styles.grid}>
              {pack.map((c) => (
                <View key={c.id} style={{ alignItems: 'center', gap: space.xs }}>
                  <Pressable onPress={() => router.push({ pathname: '/card/[id]', params: { id: String(c.id) } })} accessibilityRole="button" accessibilityLabel={`${c.name}, open card`}>
                    <SnapCard card={c} size="grid" width={gridW} competition={league.name} />
                  </Pressable>
                  {before.current ? <Text style={[type.caption, isNew(c) && { color: color.accentText }]}>{isNew(c) ? 'New' : 'Duplicate'}</Text> : null}
                </View>
              ))}
            </View>
            {before.current ? (
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Text style={[type.bodyStrong, { fontVariant: ['tabular-nums'] }]}>{`+${REWARDS.packOpened} credits for opening`}</Text>
                {dupCredits > 0 ? <Text style={[type.footnote, { fontVariant: ['tabular-nums'] }]}>{`+${dupCredits} credits and boosters from duplicates`}</Text> : null}
              </View>
            ) : (
              <Text style={type.footnote}>{profile.bonusPacks > 0 ? 'You have a bonus pack to open.' : `Next pack in ${hoursToMidnight()} h`}</Text>
            )}
            <View style={styles.summaryActions}>
              <Button label="Done" onPress={close} />
              <Button label="View collection" kind="secondary" onPress={() => router.replace('/cards')} />
            </View>
          </Animated.ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.gutter, paddingBottom: space.x3 },
  under: { marginTop: space.x3, gap: space.xs, alignItems: 'center' },
  actions: { marginTop: space.xxl, alignSelf: 'stretch', maxWidth: 420, width: '100%' },
  teaser: { height: 28, justifyContent: 'center', alignItems: 'center' },
  outcomeSlot: { height: 44, marginTop: space.lg, justifyContent: 'center', alignItems: 'center' },
  outcome: { alignItems: 'center' },
  newChip: { backgroundColor: color.accent, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  newText: { fontFamily: font.bold, fontSize: 13, letterSpacing: 0.8, color: color.onAccent },
  summary: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.gutter, paddingVertical: space.x3, gap: space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space.md, rowGap: space.lg, maxWidth: 3 * 110 + 2 * space.md },
  summaryActions: { alignSelf: 'stretch', maxWidth: 420, width: '100%', gap: space.md },
});
