import { definePluginWorker } from '@cinyuverse/plugin-sdk';

export default definePluginWorker((plugin) => {
  plugin.handle('surface.createSession', (input) => ({
    ready: true,
    artifactName: input?.artifactName ?? null,
  }));
});
