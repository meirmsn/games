#!/usr/bin/env node
// Previews never use production data (specs/all-cloudflare-deploys.md AC-8). In the one Cloudflare
// account of builds_previews_deploys: all-cloudflare, a preview can bind any resource the account
// owns, so the separation is the config: every top-level data binding in wrangler.jsonc needs a
// counterpart of the same kind and binding name in the `previews` block, naming a different
// resource. Inheritance isn't relied on: a binding with no preview counterpart fails.
// Usage: node scripts/preview-bindings-check.mjs [config]   (default wrangler.jsonc)
// Exit 0 = separate (or no bindings); 1 = a preview binding missing or shared; 2 = can't read it.
import { readFileSync } from 'node:fs';

// The data bindings and the fields that name their resource.
const KINDS = {
  d1_databases: ['database_id', 'database_name'],
  r2_buckets: ['bucket_name'],
  kv_namespaces: ['id'],
  services: ['service'],
};

// JSONC → JSON: drop comments outside strings, then trailing commas.
function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) throw new Error('unclosed /* comment');
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const file = process.argv[2] || 'wrangler.jsonc';
let config;
try {
  config = parseJsonc(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`preview-bindings-check: can't read ${file}: ${e.message}`);
  process.exit(2);
}
const previews = config.previews || {};
const problems = [];
let count = 0;
for (const [kind, fields] of Object.entries(KINDS)) {
  for (const b of config[kind] || []) {
    count++;
    const name = b.binding;
    const p = (previews[kind] || []).find((x) => x.binding === name);
    if (!p) {
      problems.push(`${kind} "${name}" has no preview binding in "previews"`);
      continue;
    }
    for (const f of fields) {
      if (b[f] === undefined) continue;
      if (p[f] === undefined)
        problems.push(`${kind} "${name}": the preview names no ${f}, so it may use production's`);
      else if (b[f] === p[f])
        problems.push(`${kind} "${name}": the preview uses the production ${f} (${b[f]})`);
    }
  }
}
if (problems.length) {
  for (const p of problems) console.log(`preview-bindings-check: ${p}`);
  process.exit(1);
}
console.log(
  `preview-bindings-check: ok, ${count ? `${count} binding(s), each with its own preview resource` : 'no data bindings'}`
);
