// Social previews (specs/social-previews.md): the landing page and every playable game share with
// their own 1200×630 picture. Static checks, no browser: scripts/check-fast.sh runs this file too.
// "Playable" means the landing page links the game's tile; a "coming soon" card isn't linked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const SITE = 'https://games.meirmsn.dev/';
const MAX_BYTES = 300 * 1024; // WhatsApp, among others, skips larger link images

const landing = readFileSync(`${root}index.html`, 'utf8');
const games = [...landing.matchAll(/<a class="tile[^"]*" href="([\w-]+)\/">/g)].map((m) => m[1]);
const pages = ['', ...games.map((g) => `${g}/`)];

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const metas = (path) => {
  const head = readFileSync(`${root}${path}index.html`, 'utf8').split('</head>')[0];
  const tags = {};
  for (const [, key, content] of head.matchAll(/<meta (?:property|name)="((?:og|twitter):[\w:]+)" content="([^"]*)" \/>/g)) {
    assert.equal(tags[key], undefined, `${path}index.html: ${key} appears twice`);
    tags[key] = unescape(content);
  }
  return tags;
};

// Width and height from a PNG's IHDR or a JPEG's start-of-frame.
const size = (file) => {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { type: 'image/png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.readUInt16BE(0) === 0xffd8) {
    for (let i = 2; i < b.length; ) {
      const marker = b.readUInt16BE(i);
      if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
        return { type: 'image/jpeg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return { type: 'unknown', w: 0, h: 0 };
};

test('social-previews: the landing page links the playable games', () => {
  assert.ok(games.length >= 7, `found ${games.length} linked tiles in index.html`);
});

test('social-previews AC-1: the landing page and every playable game have the share tags', () => {
  const required = ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt'];
  for (const path of pages) {
    const t = metas(path);
    for (const key of required) assert.ok(t[key]?.trim(), `${path}index.html: ${key} is missing or empty`);
    assert.equal(t['og:url'], SITE + path, `${path}index.html: og:url`);
    assert.equal(t['og:image:width'], '1200', `${path}index.html: og:image:width`);
    assert.equal(t['og:image:height'], '630', `${path}index.html: og:image:height`);
    assert.equal(t['twitter:card'], 'summary_large_image', `${path}index.html: twitter:card`);
    assert.equal(t['twitter:image'], t['og:image'], `${path}index.html: twitter:image`);
  }
});

test('social-previews AC-2: each og:image is its own 1200×630 file in the repo, under 300 KB', () => {
  const seen = new Map();
  for (const path of pages) {
    const t = metas(path);
    const url = t['og:image'];
    assert.ok(url?.startsWith(SITE), `${path}index.html: og:image ${url} is not an absolute URL on ${SITE}`);
    const file = root + url.slice(SITE.length);
    assert.ok(existsSync(file), `${path}index.html: ${url} is not in the repo`);
    const { type, w, h } = size(file);
    assert.equal(`${w}×${h}`, '1200×630', `${url} is ${w}×${h}`);
    assert.equal(t['og:image:type'], type, `${path}index.html: og:image:type`);
    assert.ok(statSync(file).size <= MAX_BYTES, `${url} is ${statSync(file).size} bytes, over ${MAX_BYTES}`);
    assert.ok(!seen.has(url), `${path}index.html and ${seen.get(url)}index.html share ${url}`);
    seen.set(url, path);
  }
});
