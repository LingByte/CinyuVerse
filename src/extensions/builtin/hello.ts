import type { ExtensionRegistry } from '@/extensions/registry';
import { Puzzle } from 'lucide-vue-next';
import HelloPanel from './hello.vue';

export function activateHelloExtension(registry: ExtensionRegistry) {
  registry.registerActivityBarItem({
    id: 'ext.hello',
    label: 'Hello',
    icon: Puzzle,
  });

  registry.registerSidebarPanel({
    id: 'ext.hello',
    title: 'Hello',
    component: HelloPanel,
    props: ({ rootPath }) => ({ rootPath }),
  });
}
