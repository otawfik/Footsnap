/**
 * The next duel's grounds, shared by the lobby and the deck editor: each in its home
 * club's kit, whose crowd it is, and how many of your deck's cards play there. Twists
 * stay hidden until they reveal in the game. `HomeBadge` marks a card whose club plays
 * at one of them.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { onFill, solidFill } from '../ui';
import { CROWD_BOOST } from '../../lib/game';
import { groundLabel, Stadium } from '../../lib/stadiums';
import type { PlayerCard } from '../../lib/cards';
import { color, font, radius } from '../../constants/design';

/** The next-duel ground this card's club plays at, if any. */
export const homeGround = (grounds: Stadium[] | undefined, card: PlayerCard) => grounds?.find((g) => g.clubs.includes(card.team.id));

const kitFill = (st: Stadium) => (st.colors[0] ? solidFill(st.colors[0].primary) : color.raised);

export function GroundsPreview({ grounds, deck, title = "Next duel's grounds" }: { grounds: Stadium[]; deck: PlayerCard[]; title?: string }) {
  return (
    <View style={styles.grounds}>
      <Text style={styles.groundsTitle}>{title}</Text>
      <View style={styles.groundRow}>
        {grounds.map((st) => {
          const fill = kitFill(st);
          const ink = st.colors[0] ? onFill(fill) : color.text2;
          const yours = deck.filter((c) => st.clubs.includes(c.team.id)).length;
          return (
            <View
              key={st.name}
              style={styles.ground}
              accessible
              accessibilityLabel={`${st.name}. Home crowd for ${st.codes.join(' and ') || 'nobody'}. ${yours ? `${yours} of your cards play here.` : 'None of your cards play here.'}`}
            >
              <View style={[styles.groundBand, { backgroundColor: fill }]}>
                <Text style={[styles.groundName, { color: ink }]} numberOfLines={2}>
                  {groundLabel(st.name)}
                </Text>
              </View>
              <Text style={styles.groundCrowd} numberOfLines={1}>
                {st.codes.length ? `${st.codes.join(' · ')} crowd` : 'No home side'}
              </Text>
              <Text style={[styles.groundYours, yours > 0 && { color: color.win }]} numberOfLines={1}>
                {yours ? `${yours} home card${yours > 1 ? 's' : ''}` : 'No home cards'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** "Home · Anfield +4" in the ground's kit. */
export function HomeBadge({ ground }: { ground: Stadium }) {
  const fill = kitFill(ground);
  const ink = ground.colors[0] ? onFill(fill) : color.text;
  return (
    <View style={[styles.badge, { backgroundColor: fill }]} accessible accessibilityLabel={`Home at ${ground.name}, plus ${CROWD_BOOST} there`}>
      <Text style={[styles.badgeText, { color: ink }]} numberOfLines={1}>
        {`Home · ${groundLabel(ground.name)} +${CROWD_BOOST}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grounds: { paddingHorizontal: 16, marginTop: 12, gap: 8 },
  groundsTitle: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: color.text2 },
  groundRow: { flexDirection: 'row', gap: 8 },
  ground: { flex: 1, borderRadius: radius.md, backgroundColor: 'rgba(11,18,32,0.82)', overflow: 'hidden', paddingBottom: 8, gap: 2 },
  groundBand: { height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginBottom: 4 },
  groundName: { fontFamily: font.bold, fontSize: 9.5, lineHeight: 11.5, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  groundCrowd: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: color.text, textAlign: 'center', paddingHorizontal: 4 },
  groundYours: { fontFamily: font.regular, fontSize: 11, lineHeight: 15, color: color.text2, textAlign: 'center', paddingHorizontal: 4 },
  badge: { alignSelf: 'flex-start', maxWidth: '100%', height: 20, paddingHorizontal: 7, borderRadius: 10, justifyContent: 'center' },
  badgeText: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14 },
});
