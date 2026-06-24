import type { ExtensionRegistry } from '@/extensions/registry';
import { Blocks } from 'lucide-vue-next';
import ExtensionsPanel from '@/components/extensions/ExtensionsPanel.vue';

export async function loadBuiltinExtensions(registry: ExtensionRegistry) {
  registry.registerActivityBarItem({
    id: 'extensions',
    label: 'Extensions',
    icon: Blocks,
  });

  registry.registerSidebarPanel({
    id: 'extensions',
    title: 'Extensions',
    component: ExtensionsPanel,
  });
}
