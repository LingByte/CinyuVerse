import { describe, expect, it } from 'vitest';
import {
  agentAvailableCommandsToSlashCommands,
  localSkillsToDollarCommands,
  localSkillsToSlashCommands,
  mergeComposerSlashCommands,
} from './commandSources';

describe('composer command sources', () => {
  it('keeps Codex ACP skill names that already start with $', () => {
    expect(
      agentAvailableCommandsToSlashCommands([
        { name: '$deploy', description: 'Deploy skill' },
        { name: '/$imagegen', description: 'Images' },
      ])
    ).toEqual([
      {
        name: '$deploy',
        description: 'Deploy skill',
        kind: 'COMMAND',
        sourceKind: 'native',
        sourceId: 'runtime:$deploy',
      },
      {
        name: '$imagegen',
        description: 'Images',
        kind: 'COMMAND',
        sourceKind: 'native',
        sourceId: 'runtime:$imagegen',
      },
    ]);
  });

  it('normalizes runtime available commands for slash typeahead', () => {
    expect(
      agentAvailableCommandsToSlashCommands([
        { name: '/compact', description: 'Compact context' },
        { name: ' review ', description: null },
        { name: '   ' },
      ])
    ).toEqual([
      {
        name: 'compact',
        description: 'Compact context',
        kind: 'COMMAND',
        sourceKind: 'native',
        sourceId: 'runtime:compact',
      },
      {
        name: 'review',
        description: undefined,
        kind: 'COMMAND',
        sourceKind: 'native',
        sourceId: 'runtime:review',
      },
    ]);
  });

  it('maps local skills into slash and dollar command sources', () => {
    const skills = [
      {
        name: 'impeccable',
        description: 'Polish UI',
        path: 'skills/impeccable/SKILL.md',
        invocation: '$impeccable',
      },
    ];

    expect(localSkillsToSlashCommands(skills)).toEqual([
      {
        name: 'impeccable',
        description: 'Polish UI',
        kind: 'SKILL',
        sourceKind: 'skill',
        sourceId: 'skills/impeccable/SKILL.md',
      },
    ]);
    expect(localSkillsToDollarCommands(skills)).toEqual([
      {
        name: 'impeccable',
        description: 'Polish UI',
      },
    ]);
  });

  it('keeps same-name skill and native candidates with structured identity', () => {
    expect(
      mergeComposerSlashCommands({
        catalogCommands: [{ name: 'review', description: 'Built in' }],
        runtimeCommands: [
          {
            name: '/review',
            description: 'Runtime override',
            sourceKind: 'native',
            sourceId: 'runtime:review',
          },
          {
            name: '/compact',
            description: 'Runtime compact',
            sourceKind: 'native',
            sourceId: 'runtime:compact',
          },
        ],
        skillCommands: [
          {
            name: 'review',
            kind: 'SKILL',
            sourceKind: 'skill',
            sourceId: '/skills/review/SKILL.md',
          },
        ],
      })
    ).toEqual([
      {
        name: 'review',
        description: 'Runtime override',
        sourceKind: 'native',
        sourceId: 'runtime:review',
      },
      {
        name: 'compact',
        description: 'Runtime compact',
        sourceKind: 'native',
        sourceId: 'runtime:compact',
      },
      {
        name: 'review',
        kind: 'SKILL',
        sourceKind: 'skill',
        sourceId: '/skills/review/SKILL.md',
      },
    ]);
  });
});
