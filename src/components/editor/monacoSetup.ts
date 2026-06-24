import type * as Monaco from 'monaco-editor';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

let monacoModule: typeof Monaco | null = null;
let monacoLoading: Promise<typeof Monaco> | null = null;
let defaultsApplied = false;
let projectConfigVersionApplied = -1;

export function ensureMonacoEnvironment() {
  if (typeof window === 'undefined') return;
  if (window.MonacoEnvironment) return;

  window.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker();
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };
}

export async function getMonaco() {
  ensureMonacoEnvironment();
  if (monacoModule) return monacoModule;
  if (!monacoLoading) {
    monacoLoading = import('monaco-editor').then((mod) => {
      monacoModule = mod;
      return mod;
    });
  }
  return monacoLoading;
}

export async function ensureMonacoDefaults(monaco: typeof Monaco) {
  if (defaultsApplied) return;
  defaultsApplied = true;

  try {
    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(false);
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(false);

    const common = {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution:
        (monaco.languages.typescript.ModuleResolutionKind as any).Bundler ??
        (monaco.languages.typescript.ModuleResolutionKind as any).NodeNext ??
        monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      allowJs: true,
      checkJs: false,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      esModuleInterop: true,
      resolveJsonModule: true,
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
      ...common,
      strict: false,
    } as any);

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.javascriptDefaults.getCompilerOptions(),
      ...common,
    } as any);

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSuggestionDiagnostics: true,
      noSyntaxValidation: true,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSuggestionDiagnostics: true,
      noSyntaxValidation: true,
    });
  } catch {
    // ignore
  }
}

export async function applyMonacoProjectConfigIfNeeded(monaco: typeof Monaco) {
  const { applyMonacoProjectConfig, getMonacoProjectConfigVersion } = await import('./monacoProject');
  const version = getMonacoProjectConfigVersion();
  if (version === projectConfigVersionApplied) return;
  applyMonacoProjectConfig(monaco);
  projectConfigVersionApplied = version;
}
