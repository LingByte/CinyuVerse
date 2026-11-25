/**
 * Provenance written by library imitate seed into
 * `.cinyuverse/transfer-source.md`.
 */

export type TransferSource = {
  sourceBookDir: string;
  newTitle: string | null;
  schemaVersion: string | null;
  /** Display name derived from the book directory basename. */
  sourceBookTitle: string;
};

export function parseTransferSourceMarkdown(
  markdown: string
): TransferSource | null {
  const sourceBookDir = matchField(markdown, 'sourceBookDir');
  if (!sourceBookDir) return null;
  const newTitle = matchField(markdown, 'newTitle');
  const schemaVersion = matchField(markdown, 'schemaVersion');
  return {
    sourceBookDir,
    newTitle,
    schemaVersion,
    sourceBookTitle: bookTitleFromDir(sourceBookDir),
  };
}

function matchField(markdown: string, key: string): string | null {
  const re = new RegExp(`^\\s*-\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'im');
  const m = markdown.match(re);
  const value = m?.[1]?.trim();
  return value ? value : null;
}

export function bookTitleFromDir(dir: string): string {
  const normalized = dir.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || dir;
}
