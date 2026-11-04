import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentManagementApi } from '@/features/agent-management';

import { pickAstryxOption } from './agentSettingsTestUtils';
import { AgentModelCatalogControl } from './AgentModelCatalogControl';

vi.mock('@/features/agent-management', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/agent-management')>();
  return {
    ...actual,
    agentManagementApi: {
      ...actual.agentManagementApi,
      codexModelCatalog: vi.fn(),
      kimiModelCatalog: vi.fn(),
    },
  };
});

describe('AgentModelCatalogControl', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads Codex models and projects a selection into native config', async () => {
    vi.mocked(agentManagementApi.codexModelCatalog).mockResolvedValue({
      agent_id: 'codex',
      source: 'live',
      models: [
        {
          id: 'gpt-5',
          label: 'GPT-5',
          context_window: null,
          reasoning_levels: [],
        },
      ],
      default_model: 'gpt-5',
      error: null,
    });
    const onSelect = vi.fn();
    render(
      <AgentModelCatalogControl
        agentId="codex"
        drafts={{ codex_model: '' }}
        disabled={false}
        onSelect={onSelect}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '读取模型' }));
    expect(await screen.findByText(/1 个模型/)).toHaveTextContent(
      'Runtime 实时目录'
    );
    await pickAstryxOption(
      userEvent,
      screen.getByLabelText('选择目录模型'),
      'GPT-5 · gpt-5'
    );
    expect(onSelect).toHaveBeenCalledWith('codex_model', 'gpt-5');
  });

  it('uses only the current Kimi endpoint and key draft', async () => {
    vi.mocked(agentManagementApi.kimiModelCatalog).mockRejectedValue(
      new Error('Key 无权读取模型')
    );
    render(
      <AgentModelCatalogControl
        agentId="kimi_code"
        drafts={{
          kimi_base_url: 'https://api.example/v1',
          kimi_api_key: 'new-key',
        }}
        disabled={false}
        onSelect={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: '读取模型' }));
    expect(agentManagementApi.kimiModelCatalog).toHaveBeenCalledWith(
      'https://api.example/v1',
      'new-key'
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Key 无权读取模型'
    );
  });
});
