import { describe, expect, it } from 'vitest';
import { clubColors, contrast, parseColor, mix } from '../lib/colors';

describe('club colours', () => {
  it('prefers the longest colour name', () => {
    expect(parseColor('Sky Blue')).toBe('#6CABDD');
    expect(parseColor('Navy Blue')).toBe('#1B2A5A');
    expect(parseColor('Blue')).toBe('#2563EB');
  });

  it('parses football-data.org strings', () => {
    const c = clubColors('Claret / Sky Blue');
    expect(c.primary).toBe('#7A263A');
    expect(c.secondary).toBe('#6CABDD');
  });

  it('picks an accent that reads on the dark ground', () => {
    for (const raw of ['Navy Blue / White', 'Black / White', 'Red / White', 'Claret / Sky Blue', 'White / Black']) {
      expect(contrast(clubColors(raw).accent, '#0A0E0B')).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back when colours are missing or unknown', () => {
    expect(clubColors(null).accent).toBe('#C9CCC0');
    expect(clubColors('Tartan').primary).toBe('#2F4034');
  });

  it('mixes two colours', () => {
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#ffffff');
    expect(mix('#102030', '#304050', 0.5)).toBe('#203040');
  });
});
