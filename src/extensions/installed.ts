import type { ExtensionRegistry } from '@/extensions/registry';
import { loadInstalledExtensions } from '@/extensions/store';
import JSZip from 'jszip';
import { Puzzle } from 'lucide-vue-next';
import PlaceholderViewPanel from '@/extensions/PlaceholderViewPanel.vue';

type VsixManifest = {
  name?: string;
  publisher?: string;
  displayName?: string;
  version?: string;
  main?: string;
  browser?: string;
  activationEvents?: string[];
  contributes?: {
    viewsContainers?: {
      activitybar?: Array<{ id: string; title: string; icon?: string }>;
      [k: string]: any;
    };
    views?: {
      [viewContainerId: string]: Array<{ id: string; name: string }>;
    };
  };
};

async function readInstalledManifestFromDir(installDir: string): Promise<VsixManifest> {
  const path = await import('@tauri-apps/api/path');
  const fs = await import('@tauri-apps/api/fs');

  const tryRead = async (p: string) => {
    const content = await fs.readTextFile(p);
    return JSON.parse(content) as VsixManifest;
  };

  const p1 = await path.join(installDir, 'extension', 'package.json');
  const p2 = await path.join(installDir, 'package.json');
  try {
    return await tryRead(p1);
  } catch {
    return await tryRead(p2);
  }
}

async function readVsixManifest(vsixPath: string): Promise<VsixManifest> {
  const fs = await import('@tauri-apps/api/fs');
  const bytes = await fs.readBinaryFile(vsixPath);
  const zip = await JSZip.loadAsync(bytes);
  const pkg = zip.file('extension/package.json') ?? zip.file('package.json');
  if (!pkg) throw new Error('VSIX missing package.json');
  const content = await pkg.async('string');
  return JSON.parse(content) as VsixManifest;
}

export async function loadInstalledExtensionContributions(registry: ExtensionRegistry) {
  registry.clearTag('installed');

  const installed = loadInstalledExtensions().filter((e) => !!e.vsixPath && e.enabled !== false);
  for (const ext of installed) {
    try {
      const manifest = ext.installDir
        ? await readInstalledManifestFromDir(ext.installDir)
        : await readVsixManifest(ext.vsixPath!);
      const displayName = (manifest.displayName ?? ext.displayName ?? ext.name).trim();

      const viewsContainers = manifest.contributes?.viewsContainers ?? {};
      const activityContainers =
        (viewsContainers as any).activitybar ?? (viewsContainers as any).activityBar;
      const containers = Array.isArray(activityContainers) ? activityContainers : [];
      const viewsMap = manifest.contributes?.views ?? {};

      const registerContainer = (containerId: string, title: string) => {
        const panelId = `installed.${containerId}`;
        const views = Array.isArray((viewsMap as any)[containerId])
          ? ((viewsMap as any)[containerId] as any[])
          : [];
        const normalizedViews = views
          .map((v: any) => ({
            id: typeof v?.id === 'string' ? v.id : '',
            name: typeof v?.name === 'string' ? v.name : '',
          }))
          .filter((v: any) => v.id && v.name);

        registry.registerActivityBarItemTagged('installed', {
          id: panelId,
          label: title,
          icon: Puzzle,
        });

        registry.registerSidebarPanelTagged('installed', {
          id: panelId,
          title,
          component: PlaceholderViewPanel,
          props: () => ({
            title,
            views: normalizedViews,
            extId: ext.id,
            main: typeof (manifest as any).main === 'string' ? (manifest as any).main : ext.main,
            browser: typeof (manifest as any).browser === 'string' ? (manifest as any).browser : undefined,
            activationEvents: (manifest as any).activationEvents,
          }),
        });
      };

      if (containers.length > 0) {
        for (const c of containers) {
          const containerId = typeof c?.id === 'string' ? c.id : '';
          const title = typeof c?.title === 'string' ? c.title : displayName;
          if (!containerId) continue;
          registerContainer(containerId, title);
        }
        continue;
      }

      const anyContainers: Array<{ id: string; title: string }> = [];
      for (const key of Object.keys(viewsContainers)) {
        const arr = (viewsContainers as any)[key];
        if (!Array.isArray(arr)) continue;
        for (const c of arr) {
          const containerId = typeof c?.id === 'string' ? c.id : '';
          if (!containerId) continue;
          const title = typeof c?.title === 'string' ? c.title : displayName;
          anyContainers.push({ id: containerId, title });
        }
      }
      if (anyContainers.length > 0) {
        registerContainer(anyContainers[0]!.id, anyContainers[0]!.title);
      }
    } catch {
      console.warn('[extensions] failed to load installed contributions for', ext.id);
    }
  }
}
