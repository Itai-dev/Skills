#!/usr/bin/env node
// Builds everything generated from skills/ + catalog.json:
//   site/index.html                  the browsable library (data inlined, one file)
//   .claude-plugin/marketplace.json  lets Claude Code install the skills as plugins
//   README.md                        the skill table between the INDEX markers
// Run: node scripts/build.mjs        (add --check to fail if anything is out of date)

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'));
const REPO = 'Itai-dev/Skills';
const MARKETPLACE = 'itai-skills';

// Minimal frontmatter parser: `key: value`, quoted values, and `>` / `|` block scalars.
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let [, key, val] = kv;
    if (/^[>|][-+]?$/.test(val)) {
      const block = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]) && !/^[A-Za-z][\w-]*:/.test(lines[i + 1])) {
        block.push(lines[++i].trim());
      }
      val = val[0] === '>' ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n');
    } else if (/^".*"$/.test(val)) {
      val = JSON.parse(val);
    } else if (/^'.*'$/.test(val)) {
      val = val.slice(1, -1).replace(/''/g, "'");
    }
    meta[key] = val;
  }
  return { meta, body: text.slice(m[0].length) };
}

function filesIn(dir, base = '') {
  return readdirSync(dir).sort().flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? filesIn(p, base + f + '/') : [base + f];
  });
}

const errors = [];
const dirs = readdirSync(join(root, 'skills')).filter((d) => statSync(join(root, 'skills', d)).isDirectory()).sort();

for (const d of dirs) if (!catalog.skills[d]) errors.push(`skills/${d} is not listed in catalog.json`);
for (const d of Object.keys(catalog.skills)) if (!dirs.includes(d)) errors.push(`catalog.json lists "${d}" but skills/${d} does not exist`);

const skills = dirs.filter((d) => catalog.skills[d]).map((d) => {
  const path = join(root, 'skills', d, 'SKILL.md');
  if (!existsSync(path)) { errors.push(`skills/${d} has no SKILL.md`); return null; }
  const { meta, body } = frontmatter(readFileSync(path, 'utf8'));
  if (meta.name !== d) errors.push(`skills/${d}/SKILL.md: name is "${meta.name}", expected "${d}"`);
  if (!meta.description) errors.push(`skills/${d}/SKILL.md: missing description`);
  const entry = catalog.skills[d];
  if (!catalog.categories[entry.category]) errors.push(`${d}: unknown category "${entry.category}"`);
  if (!catalog.sources[entry.source]) errors.push(`${d}: unknown source "${entry.source}"`);
  for (const f of ['title', 'summary', 'try']) if (!entry[f]) errors.push(`${d}: catalog.json is missing "${f}"`);
  return {
    name: d,
    title: entry.title || d,
    summary: entry.summary || '',
    try: entry.try || '',
    inAccount: (catalog.inAccount || []).includes(d),
    description: meta.description || '',
    argumentHint: meta['argument-hint'] || '',
    category: entry.category,
    source: entry.source,
    note: entry.note || '',
    files: filesIn(join(root, 'skills', d)),
    body,
  };
}).filter(Boolean);

if (errors.length) {
  console.error('Catalog errors:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const plugin = (cat) => `itai-${cat}`;
const outputs = {};

// 1. Marketplace: one installable plugin per category.
outputs['.claude-plugin/marketplace.json'] = JSON.stringify({
  name: MARKETPLACE,
  owner: { name: catalog.owner },
  metadata: { description: `${catalog.owner}'s skill library`, version: '0.1.0' },
  plugins: Object.entries(catalog.categories).map(([cat, c]) => ({
    name: plugin(cat),
    description: `${c.title}: ${c.blurb}`,
    source: './',
    strict: false,
    skills: skills.filter((s) => s.category === cat).map((s) => `./skills/${s.name}`),
  })).filter((p) => p.skills.length),
}, null, 2) + '\n';

// 2. Site: inline the data into the template.
const data = {
  repo: REPO,
  marketplace: MARKETPLACE,
  owner: catalog.owner,
  categories: Object.entries(catalog.categories).map(([id, c]) => ({ id, plugin: plugin(id), ...c })),
  sources: catalog.sources,
  skills,
};
const template = readFileSync(join(root, 'site/template.html'), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const page = template.replace('/*__DATA__*/null', () => json);
outputs['site/index.html'] =
  '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<!-- Generated by scripts/build.mjs from site/template.html. Do not edit by hand. -->\n' +
  page + '</html>\n';

// 3. README table.
const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const table = Object.entries(catalog.categories).map(([cat, c]) => {
  const rows = skills.filter((s) => s.category === cat);
  if (!rows.length) return '';
  const cell = (t) => t.replace(/\|/g, '\\|');
  return `### ${c.title} · \`${plugin(cat)}\`\n\n| Skill | What it does | Source |\n|---|---|---|\n` +
    rows.map((s) => `| [${cell(s.title)}](skills/${s.name}/SKILL.md) \`${s.name}\` | ${cell(s.summary)} | ${catalog.sources[s.source].label} |`).join('\n') + '\n';
}).filter(Boolean).join('\n');
outputs['README.md'] = readme.replace(
  /(<!-- INDEX:START -->)[\s\S]*?(<!-- INDEX:END -->)/,
  `$1\n<!-- Generated by scripts/build.mjs. Do not edit by hand. -->\n\n${table}\n$2`,
);

let stale = [];
for (const [rel, content] of Object.entries(outputs)) {
  const p = join(root, rel);
  const current = existsSync(p) ? readFileSync(p, 'utf8') : null;
  if (current === content) continue;
  if (check) { stale.push(rel); continue; }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log('wrote', rel);
}
if (check && stale.length) {
  console.error('Out of date (run `node scripts/build.mjs`):\n  ' + stale.join('\n  '));
  process.exit(1);
}
console.log(`${skills.length} skills in ${new Set(skills.map((s) => s.category)).size} categories`);
