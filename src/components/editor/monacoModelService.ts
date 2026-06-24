import type * as Monaco from 'monaco-editor';
import { getMonaco } from './monacoSetup';

const modelsByPath = new Map<string, Monaco.editor.ITextModel>();

export function normalizeEditorPath(path: string) {
  return path.replace(/\\/g, '/');
}

function pathToUri(path: string, monaco: typeof Monaco) {
  const normalized = normalizeEditorPath(path);
  if (normalized.startsWith('file://')) {
    return monaco.Uri.parse(normalized);
  }
  return monaco.Uri.file(path);
}

export function getModelByPath(path: string) {
  const key = normalizeEditorPath(path);
  const monaco = (globalThis as any).__gopilotMonaco as typeof Monaco | undefined;
  if (monaco) {
    try {
      const existing = monaco.editor.getModel(pathToUri(path, monaco));
      if (existing) return existing;
    } catch {
      // ignore
    }
  }
  return modelsByPath.get(key) ?? null;
}

export async function ensureModel(path: string, language: string, content: string) {
  const monaco = await getMonaco();
  const key = normalizeEditorPath(path);
  const uri = pathToUri(path, monaco);

  let model = monaco.editor.getModel(uri) ?? modelsByPath.get(key) ?? null;
  if (!model) {
    model = monaco.editor.createModel(content, language, uri);
    modelsByPath.set(key, model);
    return model;
  }

  if (model.getValue() !== content) {
    model.setValue(content);
  }
  monaco.editor.setModelLanguage(model, language);
  modelsByPath.set(key, model);
  return model;
}

export function getModelText(path: string) {
  return getModelByPath(path)?.getValue() ?? null;
}

export function disposeModel(path: string) {
  const key = normalizeEditorPath(path);
  const model = modelsByPath.get(key);
  if (!model) return;
  try {
    model.dispose();
  } catch {
    // ignore
  }
  modelsByPath.delete(key);
}

export function disposeAllModels() {
  for (const path of [...modelsByPath.keys()]) {
    disposeModel(path);
  }
}
