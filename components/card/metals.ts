/**
 * Card colour: the metal rims and the club-colour face.
 *
 * The rims carry the rarity and the face carries the club. Every colour on a card comes from
 * one of three places: the metal, the club's kit, or the photo. There are no decorative
 * gradients of their own.
 *
 *   Bronze  warm copper, rosy highlights, deep oxide shadows
 *   Silver  bright cool chrome: near-white highlights, blue-steel shadows, hard contrast
 *   Gold    rich 22-carat: butter highlights, amber body, burnt-umber shadows
 *   Icon    the special: an iridescent holo rim (it shifts hue along its length) with a
 *           gold inner band, white-gold type
 *   Legend  obsidian with a gold inner band (tier 6, any rarity)
 *
 * Text on the face is near-white metal ink, and the club field is darkened (never lightened)
 * until that ink clears 4.5:1 on the lightest part of the field it sits on. See clubField().
 */
import type { Metal } from '../../constants/design';
import { contrast, luminance, mix } from '../../lib/colors';

type Stops = { colors: [string, string, ...string[]]; locations: [number, number, ...number[]] };
const L7: [number, number, ...number[]] = [0, 0.16, 0.34, 0.5, 0.66, 0.84, 1];

export interface CardMetal {
  rim: Stops;
  /** a second, inner band (Icon and Legend): gold */
  band?: Stops;
  /** Power numeral, top to bottom */
  numeral: [string, string, ...string[]];
  /** position, nation, club code, stat labels: near-white, tinted by the metal */
  ink: string;
  name: string;
  stat: string;
  line: string;
  /** the dark plate the field settles into at the bottom (name and stats sit here) */
  plate: string;
  /** the iridescent foil over the face (Icon) */
  holo?: boolean;
}

const GOLD_RIM: Stops = { colors: ['#FFF7CF', '#E0AE3C', '#FFE58C', '#A06A12', '#FFD25E', '#7E520C', '#F2BF4A'], locations: L7 };

export const cardMetal: Record<Metal, CardMetal> = {
  common: {
    rim: { colors: ['#FFD9B8', '#C0703F', '#F6AE7A', '#82391A', '#E8915A', '#5E2610', '#D98A52'], locations: L7 },
    numeral: ['#FFF1E4', '#FFD9BD', '#F4B385', '#FFE2C8'],
    ink: '#FFE6D2', name: '#FFF4EA', stat: '#FFF7F0', line: 'rgba(240,170,120,0.75)',
    plate: '#140B07',
  },
  rare: {
    rim: { colors: ['#FFFFFF', '#9AA9BA', '#FFFFFF', '#6B7C90', '#E9F0F7', '#56677B', '#D3DEE9'], locations: L7 },
    numeral: ['#FFFFFF', '#F1F5FA', '#C9D4E0', '#FFFFFF'],
    ink: '#EEF3F8', name: '#FFFFFF', stat: '#FFFFFF', line: 'rgba(214,226,238,0.75)',
    plate: '#0A0D11',
  },
  elite: {
    rim: GOLD_RIM,
    numeral: ['#FFF8DC', '#FFE49A', '#F2C35A', '#FFEBB0'],
    ink: '#FFF0C8', name: '#FFF6DE', stat: '#FFFBEF', line: 'rgba(240,200,110,0.8)',
    plate: '#120D05',
  },
  icon: {
    // holo: pearl white running through rose, champagne, mint and sky; it reads as "special" at 110 pt
    rim: { colors: ['#FFFFFF', '#FF9FC8', '#FFE07A', '#72E6C6', '#82B4FF', '#FFB98C', '#FFF4E0'], locations: [0, 0.17, 0.34, 0.5, 0.67, 0.84, 1] },
    band: GOLD_RIM,
    numeral: ['#FFFFFF', '#FFF6DA', '#F0CF7A', '#FFFFFF'],
    ink: '#FFF8E8', name: '#FFFFFF', stat: '#FFFFFF', line: 'rgba(255,226,150,0.85)',
    plate: '#0B0A0E',
    holo: true,
  },
  legend: {
    rim: { colors: ['#45454B', '#0B0B0C', '#33333A', '#050505', '#2C2C31', '#0A0A0B', '#3A3A40'], locations: L7 },
    band: GOLD_RIM,
    numeral: ['#FFF8DC', '#FFE49A', '#E2AC3E', '#FFEBB0'],
    ink: '#FFF0C8', name: '#FFF6DE', stat: '#FFFBEF', line: 'rgba(240,200,110,0.85)',
    plate: '#070707',
  },
};

export interface ClubField {
  /** the field colour behind the player (the club's kit colour, darkened only as far as text needs) */
  field: string;
  /** the lit top of the field */
  light: string;
  /** the second kit colour: the photos-off sash and the medallion ring of light */
  accent: string;
  /** where the field turns into the bottom plate */
  deep: string;
}

// HSL, so darkening keeps the kit's hue and gains saturation instead of greying out
function toHsl(hex: string): [number, number, number] {
  const p = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  const [r, g, b] = [p(0), p(1), p(2)];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m0) * 255).toString(16).padStart(2, '0')).join('')}`;
}
/** Darker by `dl` lightness, a little richer: hue kept, saturation up (never for greys). */
const deepen = (hex: string, dl: number, ds = 0.04) => {
  const [h, s, l] = toHsl(hex);
  return fromHsl(h, s < 0.08 ? s : Math.min(1, s + ds), Math.max(0, l - dl));
};
const saturation = (hex: string) => toHsl(hex)[1];

/**
 * The club's colour as a lit field. A white or pale primary (Spurs, Leeds, Real Madrid) hands
 * the field to the second colour, so the card is never a grey wash; a black kit becomes a
 * warm charcoal. The field is then darkened in small steps until the metal ink clears 4.5:1
 * on the lit top. Memoised: there are a few dozen clubs.
 */
const cache = new Map<string, ClubField>();
export function clubField(primary: string, secondary: string, m: CardMetal): ClubField {
  const key = `${primary}${secondary}${m.ink}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pale = (c: string) => luminance(c) > 0.5 || (luminance(c) > 0.3 && saturation(c) < 0.2);
  let base = primary;
  let accent = secondary;
  if (pale(primary) && !pale(secondary)) {
    base = secondary;
    accent = primary;
  } else if (pale(primary) && pale(secondary)) {
    base = mix(primary, '#3A3F47', 0.7);
  }
  if (luminance(base) < 0.012) base = '#2B2A2E'; // black kits: charcoal, so the metal still has something to sit on
  let field = base;
  const lift = (c: string) => mix(c, '#FFFFFF', 0.1);
  for (let i = 0; i < 40 && contrast(m.ink, lift(field)) < 4.5; i++) field = deepen(field, 0.02);
  const out = { field, light: lift(field), accent, deep: mix(deepen(field, toHsl(field)[2] * 0.55, 0.08), m.plate, 0.25) };
  cache.set(key, out);
  return out;
}
