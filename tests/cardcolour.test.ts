import { describe, expect, it } from 'vitest';
import { cardMetal, clubField } from '../components/card/metals';
import { contrast, parseColor } from '../lib/colors';

const KITS = ['sky blue', 'red', 'white', 'black', 'navy blue', 'claret', 'yellow', 'gold', 'orange', 'green', 'royal blue', 'blue', 'purple', 'pink', 'grey', 'silver', 'light blue', 'amber', 'maroon'].map((k) => parseColor(k)!);

describe('club-colour card faces', () => {
  it('keeps every metal ink at 4.5:1 on the lit field, and the name on the plate, for every kit pair', () => {
    for (const m of Object.values(cardMetal))
      for (const a of KITS)
        for (const b of KITS) {
          const f = clubField(a, b, m);
          expect(contrast(m.ink, f.light)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(m.stat, f.field)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(m.name, f.deep)).toBeGreaterThanOrEqual(4.5);
        }
  });
  it('hands a white kit to its second colour, so the card is never grey', () => {
    const f = clubField(parseColor('white')!, parseColor('navy blue')!, cardMetal.elite);
    expect(f.accent).toBe(parseColor('white'));
  });
  it('keeps City sky blue, not grey', () => {
    const f = clubField(parseColor('sky blue')!, parseColor('white')!, cardMetal.icon);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(f.field.slice(i, i + 2), 16));
    expect(b - r).toBeGreaterThan(60);
    expect(b).toBeGreaterThan(g);
  });
});
