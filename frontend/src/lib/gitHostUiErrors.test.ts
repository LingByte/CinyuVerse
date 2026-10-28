import { describe, expect, it } from 'vitest';
import { getGitHostErrorPresentation } from './gitHostUiErrors';

describe('getGitHostErrorPresentation', () => {
  it('maps missing remote configuration to a localized explanation', () => {
    expect(
      getGitHostErrorPresentation(
        'Internal error: Invalid repository: No remotes configured',
        'Issues'
      )
    ).toEqual({
      title: '无法加载Issues：当前作品集还没有配置远程作品集。',
      hint: '解决方法：先为作品集添加 origin 等远程地址，例如执行 git remote add origin <作品集地址>，然后再点击刷新。',
    });
  });

  it('falls back to a generic localized message for unknown errors', () => {
    expect(getGitHostErrorPresentation('boom', 'PRs')).toEqual({
      title: '无法加载PRs。',
      hint: 'boom',
    });
  });
});
