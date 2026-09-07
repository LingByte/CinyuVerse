#!/usr/bin/env node
/**
 * Remap i18n locale values from coding-IDE terminology to novel-writing
 * terminology. Only replaces string VALUES, never JSON keys, so i18n key
 * references in code stay valid.
 *
 * Usage: node scripts/remap-i18n.js <locale-dir>
 */
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node remap-i18n.js <locale-dir>');
  process.exit(1);
}

// Ordered replacements — specific compounds first to avoid partial matches.
const replacements = [
  // --- compound / specific first ---
  ['Code Review', 'Review'],
  ['code review', 'review'],
  ['Pull Request', 'Merge Request'],
  ['pull request', 'merge request'],
  ['uncommitted', 'unsaved'],
  ['Uncommitted', 'Unsaved'],
  ['worktree', 'draft tree'],
  ['Worktree', 'Draft tree'],
  ['code-intensive', 'text-intensive'],
  ['code navigation', 'content navigation'],
  ['code changes', 'content changes'],
  ['Code changes', 'Content changes'],
  ['execute code', 'execute scripts'],
  ['generated code', 'generated content'],
  ['Generated code', 'Generated content'],
  ['modified code', 'modified content'],
  ['coding agent', 'writing agent'],
  ['Coding Agent', 'Writing Agent'],
  ['coding session', 'writing session'],
  ['Coding session', 'Writing session'],

  // --- general terms (order matters) ---
  ['Project', 'Novel'],
  ['project', 'novel'],
  ['Workspace', 'Volume'],
  ['workspace', 'volume'],
  ['Repository', 'Library'],
  ['repository', 'library'],
  ['Branch', 'Draft'],
  ['branch', 'draft'],
  ['Session', 'Writing Session'],
  ['session', 'writing session'],
  ['Commit', 'Save'],
  ['commit', 'save'],
];

function remapString(str) {
  let result = str;
  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }
  return result;
}

function walk(obj) {
  if (typeof obj === 'string') return remapString(obj);
  if (Array.isArray(obj)) return obj.map(walk);
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const key of Object.keys(obj)) {
      out[key] = walk(obj[key]); // key untouched, value remapped
    }
    return out;
  }
  return obj;
}

let total = 0;
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const filepath = path.join(dir, file);
  const original = fs.readFileSync(filepath, 'utf8');
  const json = JSON.parse(original);
  const remapped = walk(json);
  const output = JSON.stringify(remapped, null, 2) + '\n';
  if (output !== original) {
    fs.writeFileSync(filepath, output);
    const changes = original.split('\n').length - output.split('\n').length;
    console.log(`  ${file}: updated`);
    total++;
  }
}
console.log(`Done. ${total} file(s) updated in ${dir}`);
