import { useEffect, useMemo, useState } from 'react';

import { fileTreeApi } from '@/lib/api';

// The writing pipeline's progress is derived from project facts on disk —
// no separate progress ledger. A step is "done" when its artifact exists
// and is no longer the creation-time scaffold.

export type WritingGuideStepId =
  | 'foundation'
  | 'characters'
  | 'style'
  | 'graph'
  | 'write'
  | 'audit'
  | 'aigc';

export type WritingGuideStep = {
  id: WritingGuideStepId;
  optional: boolean;
  done: boolean;
  active: boolean;
};

export type WritingPipelineState = {
  worldViewInitialized: boolean;
  characterCount: number;
  hasGraph: boolean;
  hasCurrentBeat: boolean;
  chapterCount: number;
  aigcReportCount: number;
};

// Placeholder line from the scaffolded world-view.md (ProjectFormDialog).
const WORLD_VIEW_PLACEHOLDER = '描述故事发生的世界背景';

export function isScaffoldWorldView(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  return trimmed.includes(WORLD_VIEW_PLACEHOLDER);
}

export function deriveWritingGuideSteps(
  state: WritingPipelineState
): WritingGuideStep[] {
  const foundationDone = state.worldViewInitialized;
  const charactersDone = state.characterCount > 0;
  const graphDone = state.hasGraph;
  const writeDone = state.chapterCount > 0;
  const aigcDone = state.aigcReportCount > 0;

  return [
    {
      id: 'foundation',
      optional: false,
      done: foundationDone,
      active: !foundationDone,
    },
    // The graph's `characters` fields reference card file names, so the
    // main cast exists before the graph is planned.
    {
      id: 'characters',
      optional: false,
      done: charactersDone,
      active: foundationDone && !charactersDone,
    },
    // Optional enrichment: only worth suggesting once the base exists.
    { id: 'style', optional: true, done: false, active: foundationDone },
    {
      id: 'graph',
      optional: false,
      done: graphDone,
      active: foundationDone && charactersDone && !graphDone,
    },
    {
      id: 'write',
      optional: false,
      done: writeDone,
      active: foundationDone && graphDone,
    },
    // Habit steps never flip to done — they apply after every chapter.
    { id: 'audit', optional: false, done: false, active: writeDone },
    { id: 'aigc', optional: true, done: aigcDone, active: writeDone },
  ];
}

export function useWritingPipelineProgress(
  rootPath: string,
  characterCount: number,
  hasGraph: boolean,
  hasCurrentBeat: boolean,
  chapterCount: number
): {
  worldViewInitialized: boolean;
  aigcReportCount: number;
  steps: WritingGuideStep[];
} {
  const [worldViewInitialized, setWorldViewInitialized] = useState(false);
  const [aigcReportCount, setAigcReportCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!rootPath) {
      setWorldViewInitialized(false);
      setAigcReportCount(0);
      return;
    }
    fileTreeApi
      .readFile(`${rootPath}/.cinyuverse/world-view.md`)
      .then((content) => {
        if (!cancelled) setWorldViewInitialized(!isScaffoldWorldView(content));
      })
      .catch(() => {
        // Missing file counts as not initialized.
        if (!cancelled) setWorldViewInitialized(false);
      });
    fileTreeApi
      .listDirectoryChildren(rootPath, '.cinyuverse/aigc')
      .then((entries) => {
        if (!cancelled) setAigcReportCount(entries.files.length);
      })
      .catch(() => {
        if (!cancelled) setAigcReportCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const steps = useMemo(
    () =>
      deriveWritingGuideSteps({
        worldViewInitialized,
        characterCount,
        hasGraph,
        hasCurrentBeat,
        chapterCount,
        aigcReportCount,
      }),
    [
      worldViewInitialized,
      characterCount,
      hasGraph,
      hasCurrentBeat,
      chapterCount,
      aigcReportCount,
    ]
  );

  return { worldViewInitialized, aigcReportCount, steps };
}
