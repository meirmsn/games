// Draws the social previews (Open Graph / Twitter card images, 1200×630) from the landing tiles,
// so a share shows the same picture as the game's card (specs/social-previews.md):
//   assets/previews/<game>.png  each playable game's tile on its card's tone, as its card shows it
//   assets/previews/site.jpg    the landing page's collage: six tiles, 2 rows × 3 columns (a JPEG:
//                               as a PNG it passes the 300 KB some apps, WhatsApp among them, take)
// The games, their tones and which tiles are pixel art come from index.html's tiles, so a new
// game's preview needs only its tile. Re-run after a tile changes:
//   node scripts/make-previews.mjs   (needs Playwright's Chromium, like scripts/check-slow.sh)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const W = 1200;
const H = 630;

// The collage's six, in reading order (the owner may swap them).
const COLLAGE = ['reef', 'googly-faces', 'orbit', 'runes', 'splat-gallery', 'walk-on-red'];
const SITE_NAME = 'Game explorations';

// Playable games: the landing page's linked tiles (a "coming soon" card is an <article>, no link).
const html = readFileSync(`${root}index.html`, 'utf8');
const games = [...html.matchAll(/<a class="tile tone-(\w+)" href="([\w-]+)\/">\s*<div class="art"><img( class="pixel")? src="assets\/tiles\/([\w-]+)\.png"/g)].map(
  ([, tone, slug, pixel, tile]) => ({ slug, tone, tile, pixel: Boolean(pixel) }),
);
if (games.length < 6) throw new Error(`found ${games.length} playable tiles in index.html; the pattern may be stale`);
for (const slug of COLLAGE) if (!games.some((g) => g.slug === slug)) throw new Error(`collage game ${slug} has no tile`);

const PORT = 8700 + Math.floor(Math.random() * 100);
const server = spawn('python3', ['-m', 'http.server', '--bind', '127.0.0.1', String(PORT)], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'light' });
  // The landing page itself, for its tokens (light theme) and its font.
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  mkdirSync(`${root}assets/previews`, { recursive: true });
  const draw = (job) =>
    page.evaluate(async ({ job, W, H }) => {
      const css = getComputedStyle(document.documentElement);
      const token = (name) => css.getPropertyValue(name).trim();
      const load = (src) =>
        new Promise((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = () => fail(new Error(`can't load ${src}`));
          img.src = src;
        });
      // Draw a tile on its tone into the box (x, y, w, h) as the landing card does (object-fit:
      // contain, centred), or scaled to cover the box (the collage's cells).
      const tile = async (ctx, g, x, y, w, h, fit) => {
        const img = await load(`assets/tiles/${g.tile}.png`);
        const s = (fit === 'cover' ? Math.max : Math.min)(w / img.width, h / img.height);
        const dw = img.width * s;
        const dh = img.height * s;
        ctx.fillStyle = token(`--tile-${g.tone}`);
        ctx.fillRect(x, y, w, h);
        ctx.imageSmoothingEnabled = !g.pixel;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      };
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (job.game) {
        await tile(ctx, job.game, 0, 0, W, H, 'contain');
      } else {
        // The collage: 2 × 3 tiles on the page background, an 8 px gutter, rounded like the cards.
        const gap = 8;
        const cw = (W - gap * 4) / 3;
        const ch = (H - gap * 3) / 2;
        ctx.fillStyle = token('--background');
        ctx.fillRect(0, 0, W, H);
        for (const [i, g] of job.games.entries()) {
          const x = gap + (i % 3) * (cw + gap);
          const y = gap + Math.floor(i / 3) * (ch + gap);
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(x, y, cw, ch, 14);
          ctx.clip();
          await tile(ctx, g, x, y, cw, ch, 'cover');
          ctx.restore();
        }
        // The site name on a small card where the rows meet, in the landing page's font.
        await document.fonts.ready;
        const font = `700 34px ${token('--font-sans')}`;
        ctx.font = font;
        const tw = ctx.measureText(job.name).width;
        const pw = tw + 56;
        const ph = 68;
        const px = (W - pw) / 2;
        const py = (H - ph) / 2;
        ctx.save();
        ctx.shadowColor = 'rgb(0 0 0 / 0.22)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = token('--card');
        ctx.beginPath();
        ctx.roundRect(px, py, pw, ph, ph / 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = token('--foreground');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(job.name, W / 2, H / 2 + 1);
      }
      return (job.game ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)).split(',')[1];
    }, { job, W, H });

  for (const game of games) {
    writeFileSync(`${root}assets/previews/${game.slug}.png`, Buffer.from(await draw({ game }), 'base64'));
    console.log(`wrote assets/previews/${game.slug}.png`);
  }
  const collage = COLLAGE.map((slug) => games.find((g) => g.slug === slug));
  writeFileSync(`${root}assets/previews/site.jpg`, Buffer.from(await draw({ games: collage, name: SITE_NAME }), 'base64'));
  console.log('wrote assets/previews/site.jpg');
} finally {
  await browser.close();
  server.kill();
}
