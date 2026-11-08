/**
 * Hold a card in the Duel to bring it up: the full card, big, with everything the small
 * one can't show (the ability's title, text and the fact it's built from, Power now vs
 * printed, the home crowd). Tap anywhere, or the close button, to put it back.
 */
import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import Animated, { FadeIn, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { SnapCard, Look } from '../SnapCard';
import { cardStats } from '../../lib/game';
import type { PlayerCard } from '../../lib/cards';
import { color, font, radius } from '../../constants/design';

export interface Peek {
  card: PlayerCard;
  /** whose card it is, for the label */
  side: 'you' | 'opponent';
  /** Power on the board right now, if it's in play */
  power?: number;
  /** "Home crowd +4 at Anfield", when he plays at one of the grounds */
  crowd?: string;
  look?: Look;
}

export function CardPeek({ peek, onClose, competition }: { peek: Peek | null; onClose: () => void; competition?: string }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  if (!peek) return null;
  const { card, side, power, crowd, look } = peek;
  const st = cardStats(card);
  const now = power ?? st.power;
  const w = Math.min(260, width * 0.62, (height - 300) / 1.4);
  const fx = st.effect;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(140)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close card" />
        <ScrollView contentContainerStyle={styles.body} pointerEvents="box-none">
          <Animated.View entering={reduced ? undefined : ZoomIn.duration(180)} pointerEvents="none">
            <SnapCard card={card} size="full" width={w} look={look} competition={competition} power={power} />
          </Animated.View>
          <View style={[styles.panel, { width: Math.min(360, width - 32) }]} accessible accessibilityLabel={`${side === 'opponent' ? "AI Manager's " : ''}${card.name}`}>
            <Text style={styles.name} numberOfLines={1}>
              {side === 'opponent' ? 'AI · ' : ''}
              {card.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {card.position} · {card.team.shortName}
              {card.age !== null ? ` · ${card.age}` : ''}
            </Text>
            <View style={styles.stats}>
              <Stat k="Cost" v={String(st.cost)} />
              <Stat k={power !== undefined ? 'Power now' : 'Power'} v={String(now)} tone={now > st.power ? color.win : now < st.power ? color.loss : undefined} />
              {power !== undefined && now !== st.power ? <Stat k="Printed" v={String(st.power)} /> : null}
            </View>
            {fx ? (
              <View style={styles.ability}>
                <Text style={styles.abilityTitle}>{fx.title}</Text>
                <Text style={styles.abilityText}>{fx.text}</Text>
                {fx.why ? <Text style={styles.why}>{fx.why}</Text> : null}
              </View>
            ) : (
              <Text style={styles.abilityText}>No ability.</Text>
            )}
            {crowd ? (
              <View style={styles.crowd}>
                <Ionicons name="people" size={14} color={color.win} />
                <Text style={styles.crowdText}>{crowd}</Text>
              </View>
            ) : null}
          </View>
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statV, tone ? { color: tone } : null]}>{v}</Text>
      <Text style={styles.statK}>{k}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(6,10,24,0.94)' },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 16, gap: 16 },
  panel: { backgroundColor: color.raised, borderRadius: radius.lg, padding: 16, gap: 6, borderWidth: 1, borderColor: color.hairline },
  name: { fontFamily: font.bold, fontSize: 20, lineHeight: 25, color: color.text },
  meta: { fontFamily: font.medium, fontSize: 14, lineHeight: 19, color: color.text2 },
  stats: { flexDirection: 'row', gap: 20, marginTop: 6, marginBottom: 4 },
  stat: { alignItems: 'flex-start' },
  statV: { fontFamily: font.cardHeavy, fontSize: 24, lineHeight: 28, color: color.text, fontVariant: ['tabular-nums'] },
  statK: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, color: color.text2 },
  ability: { gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: color.hairline },
  abilityTitle: { fontFamily: font.bold, fontSize: 16, lineHeight: 21, color: color.accentText },
  abilityText: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.text },
  why: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.text2, fontStyle: 'italic' },
  crowd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: color.hairline, marginTop: 4 },
  crowdText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19, color: color.text },
  close: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  closeText: { fontFamily: font.semibold, fontSize: 15, color: '#FFFFFF' },
});
