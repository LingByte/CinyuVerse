export type TreeNode = {
  path: string;
  name: string;
  kind: 'dir' | 'file';
  children?: TreeNode[];
  loaded?: boolean;
};

export const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'target',
  'dist',
  'build',
  '.turbo',
  'coverage',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pnpm-store',
]);

export const MAX_DIR_ENTRIES = 800;
