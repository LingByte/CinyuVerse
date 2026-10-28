#!/usr/bin/env node
/**
 * Vendor the xin-skills writing-style skill set (github.com/oscar-wang-xin/xin-skills)
 * into frontend/public/xin-skills/ as static assets:
 *   - index.json                      skill metadata parsed from the repo README
 *   - skills/<id>.md                  verbatim SKILL.md (ten-dimension style spec)
 *   - examples/<id>.md                verbatim references/style_examples.md (when present)
 *
 * Usage: node scripts/generate-xin-style-skills.mjs <path-to-xin-skills-checkout>
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoDir = resolve(process.argv[2] ?? '');
if (!existsSync(join(repoDir, 'README.md'))) {
  console.error(`usage: node scripts/generate-xin-style-skills.mjs <xin-skills-checkout>`);
  console.error(`no README.md under ${repoDir}`);
  process.exit(1);
}

const readme = readFileSync(join(repoDir, 'README.md'), 'utf8');

// Parse the five overview tables under "## 技能总览":
//   ### 🍅 番茄小说风格（19 个）
//   | `xin-fanqie-style-gou` | 《书名》（作者） | 关键词 · 关键词 |
const categoryRe = /^### .+? ([^（]+)（\d+ 个）$/gm;
const rowRe = /^\| `([a-z0-9-]+)` \| (.+?) \| (.+?) \|$/gm;
const categories = [];
let categoryMatch;
while ((categoryMatch = categoryRe.exec(readme)) !== null) {
  categories.push({ name: categoryMatch[1].trim(), index: categoryMatch.index });
}

const skills = [];
let rowMatch;
while ((rowMatch = rowRe.exec(readme)) !== null) {
  const [, id, target, keywords] = rowMatch;
  const category =
    [...categories].reverse().find((c) => c.index < rowMatch.index)?.name ?? '未分类';
  const bookMatch = target.match(/《(.+?)》/);
  if (!bookMatch) {
    console.error(`cannot parse book title for ${id}: ${target}`);
    process.exit(1);
  }
  const authorMatch = target.match(/（(.+?)）/);
  skills.push({
    id,
    book: bookMatch[1],
    author: authorMatch ? authorMatch[1] : '',
    category,
    keywords: keywords.split(/·/).map((k) => k.trim()).filter(Boolean),
  });
}

if (skills.length !== 71) {
  console.error(`expected 71 skills, parsed ${skills.length}`);
  process.exit(1);
}

const outDir = resolve('frontend/public/xin-skills');
mkdirSync(join(outDir, 'skills'), { recursive: true });
mkdirSync(join(outDir, 'examples'), { recursive: true });

for (const skill of skills) {
  const skillPath = join(repoDir, skill.id, 'SKILL.md');
  if (!existsSync(skillPath)) {
    console.error(`missing ${skillPath}`);
    process.exit(1);
  }
  writeFileSync(join(outDir, 'skills', `${skill.id}.md`), readFileSync(skillPath, 'utf8'));

  const examplesPath = join(repoDir, skill.id, 'references', 'style_examples.md');
  skill.hasExamples = existsSync(examplesPath);
  if (skill.hasExamples) {
    writeFileSync(
      join(outDir, 'examples', `${skill.id}.md`),
      readFileSync(examplesPath, 'utf8')
    );
  }
}

const index = {
  source: 'https://github.com/oscar-wang-xin/xin-skills',
  skills,
};
writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2));

console.log(`wrote ${skills.length} skills to ${outDir}`);
