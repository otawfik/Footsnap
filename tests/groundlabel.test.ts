import { describe, expect, it } from 'vitest';
import { groundFontSize, groundLabel } from '../lib/stadiums';

describe('groundLabel', () => {
  it('leaves short names alone', () => {
    expect(groundLabel('Anfield')).toBe('Anfield');
    expect(groundLabel('Old Trafford')).toBe('Old Trafford');
  });
  it('drops a generic trailing "Stadium" from long names', () => {
    expect(groundLabel('Kingston Communications Stadium')).toBe('Kingston Communications');
  });
  it('drops a leading Estadio / Stadio / Stade / Stadion before a proper name', () => {
    expect(groundLabel('Estadio Santiago Bernabéu')).toBe('Santiago Bernabéu');
    expect(groundLabel('Stadio Giuseppe Meazza')).toBe('Giuseppe Meazza');
    expect(groundLabel('Stade Sébastien Charléty')).toBe('Sébastien Charléty');
  });
  it('keeps the word when what follows is not a proper name', () => {
    expect(groundLabel('Estadio de la Cerámica')).toBe('Estadio de la Cerámica');
    expect(groundLabel('Stadion im Borussia-Park')).toBe('Stadion im Borussia-Park');
  });
  it('drops a " - " subtitle', () => {
    expect(groundLabel('Mapei Stadium - Città del Tricolore')).toBe('Mapei Stadium');
  });
  it('drops a leading "The" from a long name', () => {
    expect(groundLabel('The American Express Community Stadium')).toBe('American Express Community');
    expect(groundLabel('The Den')).toBe('The Den');
  });
});

describe('groundFontSize', () => {
  it('keeps the full size when every word fits', () => {
    expect(groundFontSize('Anfield', 90)).toBe(9.5);
  });
  it('shrinks so the longest word fits on one line in a 375 pt-wide lobby tile', () => {
    const size = groundFontSize('Kingston Communications', 90);
    expect(size).toBeLessThan(9.5);
    expect(size).toBeGreaterThanOrEqual(7);
    // 14 letters at 0.74 em plus spacing stay inside the band
    expect(14 * size * 0.74 + 14 * 0.2).toBeLessThanOrEqual(90);
  });
  it('never goes below the floor', () => {
    expect(groundFontSize('Supercalifragilisticexpialidocious', 60)).toBe(7);
  });
});
