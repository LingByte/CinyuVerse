import { describe, expect, it } from 'vitest';
import {
  bookTitleFromDir,
  parseTransferSourceMarkdown,
} from './transferSource';

describe('parseTransferSourceMarkdown', () => {
  it('parses seed provenance', () => {
    const md = `# 分析来源

- sourceBookDir: /Users/me/Library/尸灾，肾化危机
- newTitle: 尸灾·转置
- schemaVersion: 5

含真实人名与情节拆解，供借鉴模仿；开新书时自行决定换皮程度。
`;
    const src = parseTransferSourceMarkdown(md);
    expect(src).toEqual({
      sourceBookDir: '/Users/me/Library/尸灾，肾化危机',
      newTitle: '尸灾·转置',
      schemaVersion: '5',
      sourceBookTitle: '尸灾，肾化危机',
    });
  });

  it('returns null without sourceBookDir', () => {
    expect(parseTransferSourceMarkdown('# 分析来源\n\n- newTitle: x\n')).toBe(
      null
    );
  });
});

describe('bookTitleFromDir', () => {
  it('uses the last path segment', () => {
    expect(bookTitleFromDir('/a/b/妖妻美人/')).toBe('妖妻美人');
  });
});
