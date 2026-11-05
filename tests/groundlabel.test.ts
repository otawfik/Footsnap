import { describe, expect, it } from 'vitest';
import { groundLabel } from '../lib/stadiums';

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
});
