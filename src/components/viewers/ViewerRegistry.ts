import { inject, provide, type InjectionKey, type Ref } from 'vue';
import type { FileViewerRenderer } from './types';

const ViewerRegistryKey: InjectionKey<FileViewerRenderer[] | Ref<FileViewerRenderer[]>> =
  Symbol('viewerRegistry');

export function provideViewerRegistry(renderers: FileViewerRenderer[] | Ref<FileViewerRenderer[]>) {
  provide(ViewerRegistryKey, renderers);
}

export function useViewerRenderers() {
  return inject(ViewerRegistryKey, null);
}
