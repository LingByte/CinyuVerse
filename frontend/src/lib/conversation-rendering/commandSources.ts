import type { SlashCommandDescription } from 'shared/types';
import type { AgentAvailableCommand } from '@/features/agents/types';
import type { AgentLocalSkill } from '@/lib/api';
import type { DollarCommandDescription } from '@/lib/dollarCommands';

export type ComposerSlashCommandSourceKind = 'native' | 'skill';

export type ComposerSlashCommand = SlashCommandDescription & {
  sourceKind: ComposerSlashCommandSourceKind;
  sourceId: string;
  displayLabel?: string;
  prompt?: string;
};

export type ComposerCommandSourceId = 'slash' | 'dollar' | 'file' | 'tag';

export type ComposerCommandSource<TOption> = {
  id: ComposerCommandSourceId;
  trigger: '/' | '$' | '@' | '#';
  label: string;
  options: TOption[];
};

function normalizeCommandName(name: string): string | null {
  const normalized = name.trim().replace(/^\/+/, '');
  return normalized ? normalized : null;
}

export function agentAvailableCommandsToSlashCommands(
  commands: AgentAvailableCommand[]
): ComposerSlashCommand[] {
  return commands.flatMap((command) => {
    const name = normalizeCommandName(command.name);
    if (!name) return [];

    return [
      {
        name,
        description: command.description ?? undefined,
        kind: 'COMMAND' as const,
        sourceKind: 'native' as const,
        sourceId: `runtime:${name}`,
      },
    ];
  });
}

export function localSkillsToSlashCommands(
  skills: AgentLocalSkill[]
): ComposerSlashCommand[] {
  return skills.flatMap((skill) => {
    const name = normalizeCommandName(skill.name);
    if (!name) return [];

    return [
      {
        name,
        description: skill.description ?? `Local Codex skill: ${skill.path}`,
        kind: 'SKILL' as const,
        sourceKind: 'skill' as const,
        sourceId: skill.path,
      },
    ];
  });
}

export function localSkillsToDollarCommands(
  skills: AgentLocalSkill[]
): DollarCommandDescription[] {
  return skills.flatMap((skill) => {
    const name = normalizeCommandName(skill.name);
    if (!name) return [];

    return [
      {
        name,
        description: skill.description ?? `Local Codex skill: ${skill.path}`,
      },
    ];
  });
}

export function mergeComposerSlashCommands({
  catalogCommands,
  runtimeCommands,
  skillCommands,
}: {
  catalogCommands: SlashCommandDescription[];
  runtimeCommands: ComposerSlashCommand[];
  skillCommands: ComposerSlashCommand[];
}): ComposerSlashCommand[] {
  const byName = new Map<string, ComposerSlashCommand>();
  const orderedNames: string[] = [];

  for (const rawCommand of catalogCommands) {
    const command: ComposerSlashCommand = {
      ...rawCommand,
      sourceKind: 'native',
      sourceId: `catalog:${rawCommand.name}`,
    };
    const name = normalizeCommandName(command.name);
    if (!name) continue;
    if (!byName.has(name)) {
      orderedNames.push(name);
    }
    byName.set(name, { ...command, name });
  }
  for (const command of runtimeCommands) {
    const name = normalizeCommandName(command.name);
    if (!name) continue;
    if (!byName.has(name)) orderedNames.push(name);
    byName.set(name, { ...command, name });
  }

  const nativeCommands = orderedNames.flatMap((name) => {
    const command = byName.get(name);
    return command ? [command] : [];
  });
  return [
    ...nativeCommands,
    ...skillCommands.map((command) => ({
      ...command,
      name: normalizeCommandName(command.name) ?? command.name,
    })),
  ];
}

export function createComposerCommandSource<TOption>(
  source: ComposerCommandSource<TOption>
): ComposerCommandSource<TOption> {
  return source;
}