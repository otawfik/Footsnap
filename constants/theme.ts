export const Colors = {
  // Backgrounds
  bg: '#0D0D0D',
  bgCard: '#161616',
  bgElevated: '#1C1C1C',
  bgInput: '#1A1A1A',

  // Accents
  accentGreen: '#00FF87',
  accentBlue: '#00C2FF',
  accentPurple: '#7B61FF',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#9B9B9B',
  textMuted: '#858585', // ≥4.6:1 on bg, cards and elevated; the old #555 was 2.6:1

  // Borders
  border: '#242424',
  borderLight: '#2E2E2E',

  // Status
  win: '#00FF87',
  loss: '#FF4757',
  draw: '#FFB300',

  // Tab bar
  tabActive: '#00FF87',
  tabInactive: '#555555',
  tabBar: '#111111',
} as const;

export const Typography = {
  // Font sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 38,

  // Font weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,

  // Letter spacing
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1.2,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  }),
} as const;
