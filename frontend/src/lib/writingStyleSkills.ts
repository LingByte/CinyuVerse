/**
 * Built-in writing-style skills (vendored from github.com/oscar-wang-xin/xin-skills
 * into public/xin-skills/ by scripts/generate-xin-style-skills.mjs).
 *
 * Importing a skill only stages a reference document into the project's
 * `.cinyuverse/references/` directory — the same place library books land.
 * Producing `.cinyuverse/style-sample.md` is exclusively the「提炼参考文风」
 * task's job, where the author picks one or several staged references.
 */

export type WritingStyleSkill = {
  id: string;
  book: string;
  author: string;
  category: string;
  keywords: string[];
  hasExamples: boolean;
};

export type WritingStyleIndex = {
  source: string;
  skills: WritingStyleSkill[];
};

const ASSET_BASE = '/xin-skills';

export async function fetchWritingStyleIndex(): Promise<WritingStyleIndex> {
  const resp = await fetch(`${ASSET_BASE}/index.json`);
  if (!resp.ok) {
    throw new Error(`加载写作风格索引失败 (${resp.status})`);
  }
  return (await resp.json()) as WritingStyleIndex;
}

export async function fetchWritingStyleSkillDoc(id: string): Promise<string> {
  const resp = await fetch(`${ASSET_BASE}/skills/${id}.md`);
  if (!resp.ok) {
    throw new Error(`加载文风规范失败 (${resp.status})`);
  }
  return await resp.text();
}

/** Two vendored skills ship without style examples; a 404 means "none". */
export async function fetchWritingStyleExamples(
  id: string
): Promise<string | null> {
  const resp = await fetch(`${ASSET_BASE}/examples/${id}.md`);
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`加载风格样本失败 (${resp.status})`);
  }
  return await resp.text();
}

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  return end === -1 ? markdown : markdown.slice(end + 4).replace(/^\n+/, '');
}

/** Split a style-examples file into its `## ` heading sections
 *  (the vendored files use `## 一、…`-style numbered headings). */
export function extractExcerptSections(markdown: string): string[] {
  const sections: string[][] = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      sections.push([line]);
    } else if (sections.length > 0) {
      sections[sections.length - 1].push(line);
    }
  }
  return sections.map((section) => section.join('\n').trim()).filter(Boolean);
}

/** File name a skill's staged reference gets inside `.cinyuverse/references/`.
 *  The 文风- prefix namespaces skill references apart from 书库- library
 *  books in the same directory, so neither panel's "already staged" check
 *  can false-positive on the other source's file. */
export function stagedReferenceName(skill: WritingStyleSkill): string {
  return `文风-${skill.book.replace(/[\\/:*?"<>|]/g, '_')}.md`;
}

/**
 * Compose the reference document staged by「导入文风」. Self-contained material
 * for the distill task: the style spec body plus every curated excerpt, with a
 * source marker so re-imports remain identifiable. Never touches
 * style-sample.md — distillation is the only writer of that file.
 */
export function composeStagedReference(input: {
  skill: WritingStyleSkill;
  skillMd: string;
  examplesMd: string | null;
}): string {
  const body = stripFrontmatter(input.skillMd).trim();
  const excerpts = input.examplesMd
    ? extractExcerptSections(input.examplesMd)
        .map((section) => section.replace(/^## /gm, '### '))
        .join('\n\n')
    : '';
  const byline = input.skill.author
    ? `${input.skill.author} · ${input.skill.category}`
    : input.skill.category;

  return [
    `<!-- xin-skills:${input.skill.id} -->`,
    `# 文风参考 · 《${input.skill.book}》`,
    '',
    `> ${byline}`,
    '',
    body,
    excerpts ? `\n## 代表性摘录\n\n${excerpts}` : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}
