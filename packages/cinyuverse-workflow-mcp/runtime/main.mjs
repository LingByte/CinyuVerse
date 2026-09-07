import { runStdioPluginWorker } from '@cinyuverse/plugin-sdk';
import worker from './worker.mjs';

await runStdioPluginWorker(worker);
