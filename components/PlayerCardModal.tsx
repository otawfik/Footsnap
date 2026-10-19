import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import type { Scorer } from '../lib/types';

// ---------------------------------------------------------------------------
// Tier config
// ---------------------------------------------------------------------------

export type Tier = 'S' | 'A' | 'B' | 'C';

/**
 * Tier is relative to a player's rank within their league (composite-scored).
 * rank 1-3 → S, 4-10 → A, 11-20 → B, 21+ → C
 */
export function getTier(rank: number): Tier {
  if (rank <= 3) return 'S';
  if (rank <= 10) return 'A';
  if (rank <= 20) return 'B';
  return 'C';
}

interface TierConfig {
  label: string;
  gradientColors: [string, string, string];
  glowColor: string;
  badgeBg: string;
  borderColor: string;
  textColor: string;
}

const TIER_CONFIG: Record<Tier, TierConfig> = {
  S: {
    label: 'S',
    gradientColors: ['#2A1F00', '#6B4C00', '#3D2D00'],
    glowColor: '#FFD700',
    badgeBg: '#FFD700',
    borderColor: '#FFD700',
    textColor: '#1A1200',
  },
  A: {
    label: 'A',
    gradientColors: ['#1A0A2E', '#4A1A7A', '#2D0D4A'],
    glowColor: '#B44FFF',
    badgeBg: '#7B61FF',
    borderColor: '#9B61FF',
    textColor: '#FFFFFF',
  },
  B: {
    label: 'B',
    gradientColors: ['#001A2E', '#004A7A', '#001E3D'],
    glowColor: '#00C2FF',
    badgeBg: '#00C2FF',
    borderColor: '#00C2FF',
    textColor: '#001A2E',
  },
  C: {
    label: 'C',
    gradientColors: ['#001A0D', '#004A22', '#001E10'],
    glowColor: '#00FF87',
    badgeBg: '#00FF87',
    borderColor: '#00FF87',
    textColor: '#001A0D',
  },
};

// ---------------------------------------------------------------------------
// Nationality → flag emoji helper
// ---------------------------------------------------------------------------

const NATIONALITY_FLAGS: Record<string, string> = {
  Argentina: '🇦🇷', Brazil: '🇧🇷', France: '🇫🇷', Germany: '🇩🇪',
  Spain: '🇪🇸', Portugal: '🇵🇹', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Italy: '🇮🇹',
  Netherlands: '🇳🇱', Belgium: '🇧🇪', Uruguay: '🇺🇾', Croatia: '🇭🇷',
  Poland: '🇵🇱', Denmark: '🇩🇰', Norway: '🇳🇴', Sweden: '🇸🇪',
  Switzerland: '🇨🇭', Austria: '🇦🇹', 'Czech Republic': '🇨🇿',
  Serbia: '🇷🇸', Morocco: '🇲🇦', Senegal: '🇸🇳', Nigeria: '🇳🇬',
  'South Korea': '🇰🇷', Japan: '🇯🇵', Mexico: '🇲🇽', Colombia: '🇨🇴',
  Chile: '🇨🇱', Ecuador: '🇪🇨', 'Ivory Coast': '🇨🇮', Ghana: '🇬🇭',
  Egypt: '🇪🇬', Algeria: '🇩🇿', Turkey: '🇹🇷', Greece: '🇬🇷',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', Slovakia: '🇸🇰',
  Hungary: '🇭🇺', Romania: '🇷🇴', Ukraine: '🇺🇦',
};

function nationalityFlag(nat: string): string {
  return NATIONALITY_FLAGS[nat] ?? '🌍';
}

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W * 0.72, 300);
const CARD_H = CARD_W * 1.42;
const PHOTO_H = CARD_H * 0.52; // top half

// ---------------------------------------------------------------------------
// Wikipedia photo fetch
//
// Uses the Wikipedia REST summary endpoint — ID-independent, works for any
// player with a Wikipedia article. Returns thumbnail.source (JPEG/PNG).
// Falls back to silhouette if the article has no thumbnail or the fetch fails.
// ---------------------------------------------------------------------------

async function summary(title: string): Promise<{ thumbnail?: { source?: string }; description?: string; type?: string; content_urls?: { mobile?: { page?: string }; desktop?: { page?: string } } } | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      { headers: { Accept: 'application/json' } }
    );
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * A player's photo from Wikipedia, only when the article is about a footballer:
 * try "<name> (footballer)" first, then the bare name, and reject
 * disambiguation pages or articles whose short description isn't about
 * football, so a common name doesn't come back with a stranger's face.
 */
async function fetchWikipediaPhoto(playerName: string): Promise<{ src: string; href: string } | null> {
  for (const title of [`${playerName} (footballer)`, playerName]) {
    const page = await summary(title);
    if (!page || page.type === 'disambiguation') continue;
    const about = (page.description ?? '').toLowerCase();
    if (!/football|soccer/.test(about)) continue;
    const src = page.thumbnail?.source;
    const href = page.content_urls?.mobile?.page ?? page.content_urls?.desktop?.page;
    return src && href ? { src, href } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Silhouette fallback
// ---------------------------------------------------------------------------

function PlayerSilhouette({ glowColor }: { glowColor: string }) {
  return (
    <View style={styles.silhouetteWrap}>
      <View style={[styles.silhouetteHalo, { backgroundColor: glowColor + '18' }]} />
      <View style={[styles.silhouetteHead, { borderColor: glowColor + '60', backgroundColor: glowColor + '20' }]} />
      <View style={[styles.silhouetteBody, { borderColor: glowColor + '50', backgroundColor: glowColor + '15' }]}>
        <View style={[styles.jerseyStripe, { backgroundColor: glowColor + '25' }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PlayerPhoto — fetches from Wikipedia, falls back to silhouette
// ---------------------------------------------------------------------------

function PlayerPhoto({
  playerName,
  glowColor,
}: {
  playerName: string;
  glowColor: string;
}) {
  const [photo, setPhoto] = useState<{ src: string; href: string } | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    // Reset when player changes
    setPhoto(null);
    setUseFallback(false);
    fetchWikipediaPhoto(playerName).then((found) => {
      if (found) setPhoto(found);
      else setUseFallback(true);
    });
  }, [playerName]);

  if (useFallback || photo === null) {
    return <PlayerSilhouette glowColor={glowColor} />;
  }

  // Wikipedia images are mostly CC BY-SA: credit the source and link to the
  // article, whose file page names the photographer and licence
  return (
    <View style={styles.playerPhoto}>
      <Image
        source={{ uri: photo.src }}
        style={styles.playerPhoto}
        resizeMode="cover"
        onError={() => setUseFallback(true)}
        accessibilityLabel={`Photo of ${playerName}`}
      />
      <Pressable
        style={styles.photoCredit}
        onPress={() => Linking.openURL(photo.href)}
        accessibilityRole="link"
        accessibilityLabel="Photo from Wikipedia, open the source"
        hitSlop={8}
      >
        <Text style={styles.photoCreditText}>Photo: Wikipedia ↗</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Player card
// ---------------------------------------------------------------------------

interface PlayerCardProps {
  name: string;
  nationality: string;
  teamName: string;
  teamCrest?: string;
  goals: number;
  assists: number | null;
  penalties: number | null;
  playedMatches: number;
  tier: Tier;
}

function PlayerCard({
  name,
  nationality,
  teamName,
  teamCrest,
  goals,
  assists,
  penalties,
  playedMatches,
  tier,
}: PlayerCardProps) {
  const config = TIER_CONFIG[tier];
  const flag = nationalityFlag(nationality);
  const goalsPerMatch = playedMatches > 0 ? (goals / playedMatches).toFixed(2) : '0.00';

  return (
    <View
      style={[
        styles.futCardOuter,
        {
          shadowColor: config.glowColor,
          borderColor: config.borderColor + '80',
        },
      ]}
    >
      <LinearGradient
        colors={config.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.futCard}
      >
        {/* Full-card diagonal sheen */}
        <LinearGradient
          colors={[config.glowColor + '12', 'transparent', config.glowColor + '08']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* ── PHOTO SECTION (top half) ── */}
        <View style={styles.photoSection}>
          {/* Player photo or silhouette */}
          <PlayerPhoto
            playerName={name}
            glowColor={config.glowColor}
          />

          {/* Gradient fade: photo → card background (pointerEvents none lets taps reach the photo credit) */}
          <LinearGradient
            colors={['transparent', 'transparent', config.gradientColors[2]]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.photoFade}
            pointerEvents="none"
          />

          {/* Tier badge + goals overlaid on top of photo */}
          <View style={styles.photoTopOverlay}>
            <View style={[styles.tierBadge, { backgroundColor: config.badgeBg }]}>
              <Text style={[styles.tierBadgeText, { color: config.textColor }]}>
                {config.label}
              </Text>
            </View>
            <View style={styles.goalsCircle}>
              <Text style={[styles.goalsCircleNum, { color: config.glowColor }]}>{goals}</Text>
              <Text style={[styles.goalsCircleLabel, { color: config.glowColor + 'AA' }]}>GLS</Text>
            </View>
          </View>
        </View>

        {/* ── INFO SECTION (bottom half) ── */}
        <View style={styles.infoSection}>
          {/* Club crest + nationality flag */}
          <View style={styles.futIdentityRow}>
            {teamCrest ? (
              <Image source={{ uri: teamCrest }} style={styles.futCrest} resizeMode="contain" />
            ) : (
              <View style={[styles.futCrest, { backgroundColor: config.glowColor + '20', borderRadius: 4 }]} />
            )}
            <Text style={styles.futFlag}>{flag}</Text>
          </View>

          {/* Surname large, full name small */}
          <Text
            style={[styles.futName, { color: config.glowColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {name.split(' ').slice(-1)[0].toUpperCase()}
          </Text>
          <Text style={[styles.futFullName, { color: config.glowColor + 'BB' }]} numberOfLines={1}>
            {name}
          </Text>

          {/* Divider */}
          <View style={[styles.futDivider, { backgroundColor: config.glowColor + '30' }]} />

          {/* Stats */}
          <View style={styles.futStatsRow}>
            {[
              { val: goals, label: 'GLS' },
              { val: assists ?? 0, label: 'AST' },
              { val: penalties ?? 0, label: 'PEN' },
              { val: goalsPerMatch, label: 'G/M' },
            ].map(({ val, label }) => (
              <View key={label} style={styles.futStatCell}>
                <Text style={[styles.futStatVal, { color: config.glowColor }]}>{val}</Text>
                <Text style={[styles.futStatLabel, { color: config.glowColor + '80' }]}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Club name watermark */}
          <Text style={[styles.futClubName, { color: config.glowColor + '60' }]} numberOfLines={1}>
            {teamName.toUpperCase()}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

export interface PlayerCardModalProps {
  visible: boolean;
  onClose: () => void;
  tier: Tier;
  scorer: Scorer | null;
}

export function PlayerCardModal({ visible, onClose, tier, scorer }: PlayerCardModalProps) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!scorer) return null;

  const config = TIER_CONFIG[tier];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.androidBackdrop]} />
        )}
      </TouchableOpacity>

      {/* Card + labels */}
      <Animated.View
        style={[
          styles.cardContainer,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
        pointerEvents="box-none"
      >
        <PlayerCard
          name={scorer.player.name}
          nationality={scorer.player.nationality ?? ''}
          teamName={scorer.team.name}
          teamCrest={scorer.team.crest}
          goals={scorer.goals}
          assists={scorer.assists}
          penalties={scorer.penalties}
          playedMatches={scorer.playedMatches ?? 0}
          tier={tier}
        />

        {/* Tier label */}
        <View style={styles.tierLabelRow}>
          <View style={[styles.tierPill, { borderColor: config.glowColor + '50', backgroundColor: config.glowColor + '15' }]}>
            <Text style={[styles.tierPillText, { color: config.glowColor }]}>
              {tier === 'S' ? '⭐ S-Tier · Elite' : tier === 'A' ? '🔥 A-Tier · Excellent' : tier === 'B' ? '💧 B-Tier · Strong' : '🌱 C-Tier · Rising'}
            </Text>
          </View>
        </View>

        {/* Close */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  androidBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  cardContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.base,
  },

  // ── Card outer shell (glow border) ──
  futCardOuter: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 28,
    elevation: 24,
    overflow: 'hidden',
  },
  futCard: {
    flex: 1,
  },

  // ── Photo section ──
  photoSection: {
    width: CARD_W,
    height: PHOTO_H,
    overflow: 'hidden',
  },
  playerPhoto: {
    width: '100%',
    height: '100%',
  },
  photoCredit: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 5,
    elevation: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  photoCreditText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // Silhouette fills same space when photo fails
  silhouetteWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  silhouetteHalo: {
    position: 'absolute',
    width: CARD_W * 0.65,
    height: CARD_W * 0.65,
    borderRadius: CARD_W * 0.325,
    bottom: 0,
    alignSelf: 'center',
  },
  silhouetteHead: {
    position: 'absolute',
    width: CARD_W * 0.2,
    height: CARD_W * 0.2,
    borderRadius: CARD_W * 0.1,
    borderWidth: 1.5,
    top: PHOTO_H * 0.05,
    alignSelf: 'center',
  },
  silhouetteBody: {
    position: 'absolute',
    width: CARD_W * 0.38,
    height: CARD_W * 0.24,
    borderRadius: Radius.md,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1.5,
    bottom: 0,
    overflow: 'hidden',
    alignItems: 'center',
    alignSelf: 'center',
  },
  jerseyStripe: {
    width: '60%',
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  // Gradient at bottom of photo that fades into card background
  photoFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: PHOTO_H * 0.5,
  },
  // Tier badge + goals float on top of the photo
  photoTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },

  // ── Info section ──
  infoSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    justifyContent: 'center',
  },

  // Tier badge
  tierBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  tierBadgeText: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
    letterSpacing: 1,
  },

  // Goals
  goalsCircle: {
    alignItems: 'center',
  },
  goalsCircleNum: {
    fontSize: Typography.xxl,
    fontWeight: Typography.black,
    lineHeight: 32,
  },
  goalsCircleLabel: {
    fontSize: 8,
    fontWeight: Typography.bold,
    letterSpacing: 1.5,
  },

  // Identity row
  futIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  futCrest: {
    width: 28,
    height: 28,
  },
  futFlag: {
    fontSize: 20,
  },

  // Name
  futName: {
    fontSize: Typography.xxl,
    fontWeight: Typography.black,
    letterSpacing: Typography.tight,
    textAlign: 'center',
  },
  futFullName: {
    fontSize: Typography.xs,
    fontWeight: Typography.medium,
    letterSpacing: Typography.wider,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // Divider
  futDivider: {
    width: '80%',
    height: 1,
    marginVertical: 2,
  },

  // Stats
  futStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: Spacing.xs,
  },
  futStatCell: {
    alignItems: 'center',
    flex: 1,
  },
  futStatVal: {
    fontSize: Typography.md,
    fontWeight: Typography.black,
  },
  futStatLabel: {
    fontSize: 8,
    fontWeight: Typography.bold,
    letterSpacing: 1,
    marginTop: 1,
  },

  // Club name watermark
  futClubName: {
    fontSize: 8,
    fontWeight: Typography.bold,
    letterSpacing: 2,
    textAlign: 'center',
  },

  // Below-card UI
  tierLabelRow: {
    alignItems: 'center',
  },
  tierPill: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  tierPillText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
