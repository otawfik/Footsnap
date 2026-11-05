/**
 * The deck editor (opened from Play → Edit deck). Your 12 stay pinned on top with the
 * cost curve and total Power; below, the next duel's three grounds and your cards for
 * this competition, filterable by club, position and "home at the next grounds",
 * sortable by cost or Power. Tap a card to add or remove it. Loans fill only the slots
 * you leave empty and are marked LOAN; add one of your own cards and it takes the slot.
 * Every change saves at once (lib/storage useDeckSaves). Auto-fill puts back the
 * automatic deck: your strongest cards on the cost curve.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FilterChips, Segmented, tap } from '../components/ui';
import { DuelCard, EmptySlot } from '../components/duel/DuelCard';
import { GroundsPreview, HomeBadge, homeGround } from '../components/duel/Grounds';
import { useLeague } from '../context/league';
import { useDuelSetup } from '../hooks/duel';
import { useCollection } from '../lib/storage';
import { deckSummary, toggleInDeck, validateDeck } from '../lib/decks';
import { lookOf } from '../lib/collection';
import { cardStats, CROWD_BOOST, DECK_SIZE } from '../lib/game';
import type { PlayerCard } from '../lib/cards';
import type { Line } from '../lib/football';
import { color, font, gem, radius, space } from '../constants/design';

const GUTTER = space.gutter;
const SLOT_GAP = 6;
const LINES: (Line | null)[] = [null, 'GK', 'DF', 'MF', 'FW'];
const LINE_LABEL = ['All', 'GK', 'DF', 'MF', 'FW'];
const LINE_NAME: Record<Line, string> = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };

export default function DeckEditor() {
  const { league } = useLeague();
  const setup = useDuelSetup(league);
  const { deck, mine, ids, setIds, autoFill, grounds } = setup;
  const [collection] = useCollection();
  const owned = collection[String(league.id)] ?? {};
  const reduced = useReducedMotion();
  const [club, setClub] = useState(0);
  const [line, setLine] = useState(0);
  const [sort, setSort] = useState(0);
  const [homeOnly, setHomeOnly] = useState(false);
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  const insets = useSafeAreaInsets();
  // the toast clears itself
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);

  // clubs you own cards from, most cards first
  const clubs = useMemo(() => {
    const n = new Map<number, { id: number; name: string; count: number }>();
    for (const c of mine) {
      const x = n.get(c.team.id) ?? { id: c.team.id, name: c.team.shortName, count: 0 };
      x.count++;
      n.set(c.team.id, x);
    }
    return [...n.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [mine]);

  const shown = useMemo(() => {
    const clubId = club > 0 ? clubs[club - 1]?.id : undefined;
    const ln = LINES[line];
    const xs = mine.filter((c) => (clubId === undefined || c.team.id === clubId) && (!ln || c.line === ln) && (!homeOnly || homeGround(grounds, c)));
    const by = (c: PlayerCard) => cardStats(c);
    return xs.sort((a, b) =>
      sort === 0
        ? by(a).cost - by(b).cost || by(b).power - by(a).power || a.name.localeCompare(b.name)
        : by(b).power - by(a).power || by(a).cost - by(b).cost || a.name.localeCompare(b.name)
    );
  }, [mine, club, clubs, line, sort, homeOnly, grounds]);

  const inDeck = useMemo(() => new Set(ids), [ids]);
  const summary = deck ? deckSummary(deck.cards) : null;
  const invalid = deck ? validateDeck(deck.cards) : null;
  const mineIn = deck ? deck.cards.length - deck.loans.size : 0;

  const say = (text: string) => setNote({ text, key: Date.now() });
  const homeCount = grounds ? mine.filter((c) => homeGround(grounds, c)).length : 0;
  const toggle = (c: PlayerCard) => {
    const r = toggleInDeck(ids, c.id);
    if (r.error) {
      tap('light');
      say(r.error);
      return;
    }
    tap('select');
    setIds(r.ids);
    say(r.ids.length > ids.length ? `${c.banner} in.` : `${c.banner} out.${r.ids.length < DECK_SIZE ? ' A loan fills the slot.' : ''}`);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/play'));

  return (
    <SafeAreaView style={styles.wrap} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <Pressable onPress={close} hitSlop={12} style={styles.headSide} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={26} color={color.text} />
        </Pressable>
        <Text style={styles.headTitle} accessibilityRole="header" numberOfLines={1}>
          Your deck
        </Text>
        <Pressable
          onPress={() => {
            tap('select');
            autoFill();
            say('Auto-filled: your strongest cards on the cost curve.');
          }}
          disabled={!deck}
          hitSlop={10}
          style={[styles.headSide, { alignItems: 'flex-end' }]}
          accessibilityRole="button"
          accessibilityLabel="Auto-fill: build the automatic deck"
        >
          <Text style={styles.navAction} numberOfLines={1}>
            Auto-fill
          </Text>
        </Pressable>
      </View>

      {/* your 12, pinned */}
      <View style={styles.top}>
        <View style={styles.deckHead}>
          <Text style={styles.deckTitle}>
            {`${mineIn} yours`}
            {deck?.loans.size ? <Text style={{ color: color.text2, fontFamily: font.medium }}>{` · ${deck.loans.size} on loan`}</Text> : null}
          </Text>
          {ids.length ? (
            <Pressable
              onPress={() => {
                tap('select');
                setIds([]);
                say('Cleared. Loans fill every slot until you add your cards.');
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear: take all your cards out"
            >
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <Slots deck={deck} grounds={grounds} tierOf={(id) => lookOf(owned[String(id)]).tier} onCard={(c, loan) => (loan ? say('A loan: it fills an empty slot. Add one of your cards below to replace it.') : toggle(c))} />
        {summary ? <Curve curve={summary.curve} power={summary.power} /> : null}
        {invalid ? <Text style={[styles.note, { color: color.loss, marginTop: 6 }]}>{invalid}</Text> : null}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingBottom: space.x4 }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingBottom: space.sm }}>
            {grounds && deck ? <GroundsPreview grounds={grounds} deck={deck.cards} title={`Next duel's grounds: your first home card at each gets +${CROWD_BOOST}`} /> : null}
            {grounds && homeCount ? (
              <Pressable
                onPress={() => {
                  tap('select');
                  setHomeOnly((h) => !h);
                }}
                style={[styles.homeToggle, homeOnly && styles.homeToggleOn]}
                accessibilityRole="switch"
                accessibilityState={{ checked: homeOnly }}
                accessibilityLabel={`Only cards that play at the next grounds, ${homeCount}`}
              >
                <Ionicons name={homeOnly ? 'checkmark-circle' : 'home-outline'} size={16} color={homeOnly ? color.onChalk : color.text} />
                <Text style={[styles.homeToggleText, homeOnly && { color: color.onChalk }]}>{`Only home cards for these grounds (${homeCount})`}</Text>
              </Pressable>
            ) : null}
            <View style={{ paddingHorizontal: GUTTER }}>
              <FilterChips options={['All clubs', ...clubs.map((c) => c.name)]} value={club} onChange={setClub} />
            </View>
            <View style={styles.controls}>
              <Segmented options={LINE_LABEL} value={line} onChange={setLine} style={{ flex: 1 }} />
              <Segmented options={['Cost', 'Power']} value={sort} onChange={setSort} style={{ width: 128 }} />
            </View>
            <Text style={styles.count}>
              {mine.length
                ? `${shown.length} of your ${mine.length} ${league.name} cards · sorted by ${sort === 0 ? 'cost' : 'Power'}`
                : `You have no ${league.name} cards yet. Open your daily pack to collect some; until then your deck is all loans.`}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <CardRow card={item} tier={lookOf(owned[String(item.id)]).tier} selected={inDeck.has(item.id)} full={ids.length >= DECK_SIZE} home={homeGround(grounds, item)} onPress={() => toggle(item)} />
        )}
        ListEmptyComponent={mine.length ? <Text style={[styles.count, { paddingTop: space.lg }]}>No cards match these filters.</Text> : null}
      />

      {/* what just changed: a toast, so the list never jumps */}
      <View pointerEvents="none" style={[styles.toastWrap, { bottom: Math.max(insets.bottom, 12) + 8 }]} accessibilityLiveRegion="polite">
        {note ? (
          <Animated.View key={note.key} entering={reduced ? undefined : FadeIn.duration(160)} exiting={reduced ? undefined : FadeOut.duration(160)} style={styles.toast}>
            <Text style={styles.toastText} numberOfLines={2}>
              {note.text}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- the 12 slots

function Slots({
  deck,
  grounds,
  tierOf,
  onCard,
}: {
  deck: ReturnType<typeof useDuelSetup>['deck'];
  grounds: ReturnType<typeof useDuelSetup>['grounds'];
  tierOf: (id: number) => number;
  onCard: (c: PlayerCard, loan: boolean) => void;
}) {
  const [w, setW] = useState(0);
  const cw = w ? Math.floor((w - SLOT_GAP * 5) / 6) : 0;
  const cards = deck?.cards ?? [];
  return (
    <View style={styles.slots} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityLabel={`Your deck, ${cards.length} of ${DECK_SIZE} cards`}>
      {cw
        ? Array.from({ length: DECK_SIZE }, (_, i) => {
            const c = cards[i];
            if (!c) return <EmptySlot key={`e${i}`} w={cw} />;
            const loan = !!deck?.loans.has(c.id);
            const st = cardStats(c);
            const home = homeGround(grounds, c);
            const kit = home?.colors[home.clubs.indexOf(c.team.id)];
            return (
              <Pressable
                key={c.id}
                onPress={() => onCard(c, loan)}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, cost ${st.cost}, Power ${st.power}${loan ? ', on loan' : ''}${home ? `, home at ${home.name}` : ''}. ${loan ? 'Loan' : 'Tap to take it out'}`}
              >
                <View style={loan ? styles.loanCard : null}>
                  <DuelCard card={c} size="hand" width={cw} tier={loan ? 0 : tierOf(c.id)} />
                </View>
                {loan ? (
                  <View style={styles.loanTag} pointerEvents="none">
                    <Text style={styles.loanText}>LOAN</Text>
                  </View>
                ) : null}
                {kit ? <View pointerEvents="none" style={[styles.homeDot, { backgroundColor: kit.primary, borderColor: kit.secondary }]} /> : null}
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

// ---------------------------------------------------------------- cost curve

function Curve({ curve, power }: { curve: number[]; power: number }) {
  const top = Math.max(4, ...curve);
  return (
    <View style={styles.curveRow}>
      <View style={styles.curveKey}>
        <Text style={styles.curveKeyText}>Cards</Text>
        <Text style={styles.curveKeyText}>Cost</Text>
      </View>
      <View style={styles.curve} accessible accessibilityLabel={`Cost curve: ${curve.map((n, i) => `${n} costing ${i + 1}`).join(', ')}`}>
        {curve.map((n, i) => (
          <View key={i} style={styles.curveCol}>
            <Text style={[styles.curveNum, !n && { color: color.text3 }]}>{n}</Text>
            <View style={styles.curveTrack}>
              <View style={[styles.curveBar, { height: `${(n / top) * 100}%` }]} />
            </View>
            <View style={styles.curveGem}>
              <Text style={styles.curveCost}>{i + 1}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.power} accessible accessibilityLabel={`Total Power ${power}`}>
        <Text style={styles.powerNum}>{power}</Text>
        <Text style={styles.powerLabel}>Total Power</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- a collection row

function CardRow({ card, tier, selected, full, home, onPress }: { card: PlayerCard; tier: number; selected: boolean; full: boolean; home: ReturnType<typeof homeGround>; onPress: () => void }) {
  const st = cardStats(card);
  const e = st.effect;
  const blocked = !selected && full;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.raised }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${card.name}, ${card.team.shortName}, cost ${st.cost}, Power ${st.power}. ${e ? `${e.title}: ${e.text}` : ''}${home ? ` Home at ${home.name}.` : ''} ${selected ? 'In your deck: tap to take it out' : blocked ? 'Deck full' : 'Tap to add'}`}
    >
      <DuelCard card={card} size="hand" width={46} tier={tier} />
      <View style={styles.rowMid}>
        <Text style={styles.rowName} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          <Text style={styles.rowStat}>{`Cost ${st.cost} · Power ${st.power}`}</Text>
          {`  ${card.team.shortName} · ${card.line ? LINE_NAME[card.line] : card.position}`}
        </Text>
        {e ? (
          <Text style={styles.rowAbility} numberOfLines={2}>
            <Text style={{ color: color.accentText, fontFamily: font.semibold }}>{e.title}</Text>
            {`  ${e.text}`}
          </Text>
        ) : null}
        {home ? (
          <View style={{ marginTop: 4 }}>
            <HomeBadge ground={home} />
          </View>
        ) : null}
      </View>
      <View style={[styles.mark, selected && styles.markOn, blocked && { opacity: 0.35 }]}>
        <Ionicons name={selected ? 'checkmark' : 'add'} size={18} color={selected ? color.onAccent : color.text} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.bg },
  navAction: { fontFamily: font.semibold, fontSize: 16, color: color.accentText },
  top: { paddingHorizontal: GUTTER, paddingBottom: 12, borderBottomWidth: 1, borderColor: color.hairline, backgroundColor: color.bg },
  deckHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 28 },
  deckTitle: { fontFamily: font.semibold, fontSize: 14, color: color.text, fontVariant: ['tabular-nums'] },
  clear: { fontFamily: font.semibold, fontSize: 14, color: color.accentText },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: SLOT_GAP, marginTop: 4 },
  loanCard: { opacity: 0.6 },
  loanTag: {
    position: 'absolute',
    left: 3,
    right: 3,
    bottom: 4,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeDot: { position: 'absolute', bottom: -3, right: -3, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  loanText: { fontFamily: font.bold, fontSize: 9.5, lineHeight: 12, letterSpacing: 0.6, color: color.onChalk },
  curveRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, gap: 16 },
  curve: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  curveCol: { flex: 1, alignItems: 'center', gap: 2 },
  curveNum: { fontFamily: font.semibold, fontSize: 12, lineHeight: 15, color: color.text, fontVariant: ['tabular-nums'] },
  curveTrack: { width: '100%', height: 22, borderRadius: 3, backgroundColor: color.raised, justifyContent: 'flex-end', overflow: 'hidden' },
  curveBar: { width: '100%', backgroundColor: color.accent, borderRadius: 3 },
  curveGem: { width: 18, height: 18, borderRadius: 9, backgroundColor: gem.mid, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  curveCost: { fontFamily: font.bold, fontSize: 11, lineHeight: 13, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  curveKey: { justifyContent: 'space-between', height: 61, paddingBottom: 1, marginRight: -6 },
  curveKeyText: { fontFamily: font.medium, fontSize: 12, lineHeight: 15, color: color.text2 },
  head: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  headSide: { width: 84, justifyContent: 'center' },
  headTitle: { flex: 1, textAlign: 'center', fontFamily: font.semibold, fontSize: 17, color: color.text },
  homeToggle: {
    marginHorizontal: GUTTER,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  homeToggleOn: { backgroundColor: color.chalk, borderColor: color.chalk },
  homeToggleText: { fontFamily: font.semibold, fontSize: 13, color: color.text },
  toastWrap: { position: 'absolute', left: GUTTER, right: GUTTER, alignItems: 'center' },
  toast: { backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.hairlineStrong, paddingHorizontal: 14, paddingVertical: 10, maxWidth: 420 },
  toastText: { fontFamily: font.medium, fontSize: 14, lineHeight: 19, color: color.text, textAlign: 'center' },
  power: { alignItems: 'flex-end', paddingBottom: 1 },
  powerNum: { fontFamily: font.bold, fontSize: 26, lineHeight: 30, color: color.text, fontVariant: ['tabular-nums'] },
  powerLabel: { fontFamily: font.medium, fontSize: 12, lineHeight: 15, color: color.text2 },
  note: { fontFamily: font.medium, fontSize: 13, lineHeight: 17, color: color.text2 },
  controls: { flexDirection: 'row', gap: 10, paddingHorizontal: GUTTER },
  count: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.text2, paddingHorizontal: GUTTER },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.hairline },
  rowMid: { flex: 1, gap: 1 },
  rowName: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: color.text },
  rowMeta: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: color.text2 },
  rowStat: { fontFamily: font.semibold, color: color.text, fontVariant: ['tabular-nums'] },
  rowAbility: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: color.text2, marginTop: 2 },
  mark: { width: 32, height: 32, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  markOn: { backgroundColor: color.accent, borderColor: color.accent },
});
