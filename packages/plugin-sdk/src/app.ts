import type { JsonValue } from './protocol.js';

export interface ArtifactTextDocument {
  readonly name: string;
  readonly content: string;
  readonly revision: string;
}

export interface ArtifactWriteResult {
  readonly revision: string;
}

export interface CinyuverseArtifactEditorBridge {
  readonly name: string;
  readText(): Promise<ArtifactTextDocument>;
  writeText(
    content: string,
    expectedRevision: string
  ): Promise<ArtifactWriteResult>;
}

export interface CinyuverseAppBridge {
  readonly pluginId: string;
  readonly generation: number;
  /** Present only when this App is mounted in an `artifact.editor` file tab. */
  readonly artifact?: CinyuverseArtifactEditorBridge;
  invoke<T extends JsonValue = JsonValue>(
    handler: string,
    input?: JsonValue
  ): Promise<T>;
  subscribe(
    channel: string,
    listener: (payload: JsonValue) => void
  ): () => void;
  ready(): void;
}

export interface PluginAppEnvironment {
  bridge: CinyuverseAppBridge;
  root: HTMLElement;
  signal: AbortSignal;
}

export interface PluginAppDefinition {
  readonly apiVersion: '1.0';
  readonly mount: (
    environment: PluginAppEnvironment
  ) =>
    | void
    | (() => void | Promise<void>)
    | Promise<void | (() => void | Promise<void>)>;
}

export function definePluginApp(
  mount: PluginAppDefinition['mount']
): PluginAppDefinition {
  return { apiVersion: '1.0', mount };
}
