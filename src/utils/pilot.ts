import { invoke } from '@tauri-apps/api/tauri';

export const EXPLORER_ROOT_KEY = 'gopilot.explorer.rootPath';
export const RECENT_PROJECTS_KEY = 'gopilot.recentProjects';

export function pilotOutputLogPath(rootPath: string) {
  return `${rootPath}/.pilot/output.jsonl`;
}

export function pilotSessionPath(rootPath: string) {
  return `${rootPath}/.pilot/session.json`;
}

export async function createPilotIndexFile(rootPath: string) {
  try {
    const pilotDirPath = `${rootPath}/.pilot`;
    const pilotIndexPath = `${pilotDirPath}/index.json`;
    const pilotContent = JSON.stringify(
      {
        version: '1.0.0',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        rootPath,
        files: [],
        lastIndexed: null,
      },
      null,
      2,
    );

    try {
      await invoke('delete_file', { path: pilotDirPath });
    } catch {
      // ignore
    }

    try {
      await invoke('delete_file', { path: `${rootPath}\\.pilot` });
    } catch {
      // ignore
    }

    await invoke('create_directory', { path: pilotDirPath });
    await invoke('write_file', { path: pilotIndexPath, content: pilotContent });
  } catch (error) {
    console.error('Failed to create .pilot file:', error);
  }
}
