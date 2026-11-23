/**
 * Draws a share card (lib/share.ts) to a PNG in the browser: the app's ground, chalk text, Inter
 * and Inter Tight as loaded by the page, kit-colour stripes for the clubs. Web only (it needs a
 * canvas); native builds share the text.
 */
import { brier3, closerLine, headline, type ShareCard } from './share';
import { color, font } from '../constants/design';

const W = 1080;
const PAD = 72;
const ROW = 92;
const HERO = 300;

/** the card's height for its rows */
export const cardHeight = (c: Pick<ShareCard, 'rows' | 'more'>) => 392 + HERO + 196 + c.rows.length * ROW + (c.more ? 64 : 0) + 190;

const f = (family: string, px: number) => `${px}px "${family}", system-ui, sans-serif`;

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawCard(ctx: CanvasRenderingContext2D, c: ShareCard, site: string) {
  const H = cardHeight(c);
  const text = (s: string, x: number, y: number, fontSpec: string, fill: string, align: CanvasTextAlign = 'left') => {
    ctx.font = fontSpec;
    ctx.fillStyle = fill;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color.bg;
  ctx.fillRect(0, 0, W, H);
  // the pitch-green wash the app's screens carry at the top
  const wash = ctx.createLinearGradient(0, 0, 0, 420);
  wash.addColorStop(0, 'rgba(30,158,95,0.34)');
  wash.addColorStop(1, 'rgba(30,158,95,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 420);

  text('FOOTSNAP', PAD, 118, f(font.cardHeavy, 34), color.accentText);
  text('BEAT THE MODEL', W - PAD, 118, f(font.semibold, 26), color.text2, 'right');
  ctx.font = f(font.cardHeavy, 76);
  text(fit(ctx, headline(c), W - PAD * 2), PAD, 248, f(font.cardHeavy, 76), color.text);
  ctx.font = f(font.medium, 36);
  text(fit(ctx, c.title, W - PAD * 2), PAD, 316, f(font.medium, 36), color.text2);

  // you vs the model
  const top = 392;
  round(ctx, PAD, top, W - PAD * 2, HERO, 40, color.surface);
  text(brier3(c.you), PAD + 48, top + 170, f(font.cardHeavy, 132), c.lead === 'you' ? color.accentText : color.text);
  text(brier3(c.model), W - PAD - 48, top + 170, f(font.cardHeavy, 132), c.lead === 'model' ? color.accentText : color.text, 'right');
  text('vs', W / 2, top + 150, f(font.medium, 36), color.text3, 'center');
  text('Me', PAD + 52, top + 236, f(font.medium, 34), color.text2);
  text('Model', W - PAD - 52, top + 236, f(font.medium, 34), color.text2, 'right');

  let y = top + HERO + 62;
  text(`Average Brier score on ${c.n} ${c.n === 1 ? 'match' : 'matches'}, called before kick-off.`, PAD, y, f(font.regular, 30), color.text2);
  text('Lower is better: 0 is perfect, 2 is as wrong as it gets.', PAD, y + 44, f(font.regular, 30), color.text2);
  y += 134;
  const colModel = W - PAD;
  const colYou = W - PAD - 170;
  text('ME', colYou, y - 26, f(font.semibold, 24), color.text3, 'right');
  text('MODEL', colModel, y - 26, f(font.semibold, 24), color.text3, 'right');

  for (const r of c.rows) {
    ctx.fillStyle = color.hairline;
    ctx.fillRect(PAD, y, W - PAD * 2, 2);
    round(ctx, PAD, y + 22, 10, 50, 5, r.tones[0]);
    round(ctx, PAD + 16, y + 22, 10, 50, 5, r.tones[1]);
    ctx.font = f(font.semibold, 34);
    text(fit(ctx, `${r.home} ${r.score} ${r.away}`, colYou - 150 - (PAD + 48)), PAD + 48, y + 59, f(font.semibold, 34), color.text);
    text(brier3(r.you), colYou, y + 59, f(font.semibold, 34), r.closer === 'you' ? color.accentText : color.text2, 'right');
    text(brier3(r.model), colModel, y + 59, f(font.semibold, 34), r.closer === 'model' ? color.accentText : color.text2, 'right');
    y += ROW;
  }
  ctx.fillStyle = color.hairline;
  ctx.fillRect(PAD, y, W - PAD * 2, 2);
  if (c.more) {
    text(`and ${c.more} more in the averages`, PAD, y + 48, f(font.regular, 28), color.text3);
    y += 64;
  }
  text(closerLine(c), PAD, y + 76, f(font.semibold, 34), color.text);
  text(site, PAD, y + 132, f(font.medium, 28), color.text3);
}

/** The card as a PNG. Rejects where there is no canvas. */
export async function cardImage(c: ShareCard, site: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = cardHeight(c);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  // the page's fonts load on demand: make sure the ones the card uses are in before drawing
  await Promise.all([font.cardHeavy, font.semibold, font.medium, font.regular].map((x) => document.fonts?.load(f(x, 34)).catch(() => null)));
  drawCard(ctx, c, site);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
}
