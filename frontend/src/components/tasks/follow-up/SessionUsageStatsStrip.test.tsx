import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionStats } from 'shared/types';
import { SessionUsageStatsStrip } from './SessionUsageStatsStrip';
import { conversationApi } from '@/features/conversation/conversationApi';
import { listenToConversationEvents } from '@/features/conversation/events';

vi.mock('@/features/conversation/conversationApi', () => ({
  conversationApi: {
    detail: vi.fn(),
  },
}));

vi.mock('@/features/conversation/events', () => ({
  listenToConversationEvents: vi.fn(() => Promise.resolve(() => {})),
}));

function renderStrip(conversationId: string | null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionUsageStatsStrip conversationId={conversationId} />
    </QueryClientProvider>
  );
}

function sessionStats(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    total_usage: {
      input_tokens: 1500n,
      output_tokens: 200n,
      cache_creation_input_tokens: 0n,
      cache_read_input_tokens: 0n,
      context_used: null,
      context_window_max: null,
      cost_amount: null,
      cost_currency: null,
    },
    total_tokens: 1700n,
    total_duration_ms: 0n,
    ...overrides,
  };
}

describe('SessionUsageStatsStrip', () => {
  beforeEach(() => {
    vi.mocked(conversationApi.detail).mockReset();
    vi.mocked(listenToConversationEvents).mockClear();
  });

  it('renders provided input/output/total segments', async () => {
    vi.mocked(conversationApi.detail).mockResolvedValue({
      session_stats: sessionStats(),
    } as never);

    renderStrip('conversation-1');

    const strip = await screen.findByTestId('session-usage-stats');
    await waitFor(() => {
      expect(strip.textContent).toContain('1.5K');
      expect(strip.textContent).toContain('200');
      expect(strip.textContent).toContain('1.7K');
    });
    expect(strip.textContent).not.toContain('$');
  });

  it('renders cache segments and cost only when provided', async () => {
    vi.mocked(conversationApi.detail).mockResolvedValue({
      session_stats: sessionStats({
        total_usage: {
          input_tokens: 1500n,
          output_tokens: 200n,
          cache_creation_input_tokens: 0n,
          cache_read_input_tokens: 80_000n,
          context_used: null,
          context_window_max: null,
          cost_amount: 0.1234,
          cost_currency: 'USD',
        },
        total_tokens: 81_700n,
      }),
    } as never);

    renderStrip('conversation-1');

    const strip = await screen.findByTestId('session-usage-stats');
    await waitFor(() => {
      expect(strip.textContent).toContain('80.0K');
      expect(strip.textContent).toContain('$0.1234');
    });
  });

  it('renders nothing when the agent never reported usage', async () => {
    vi.mocked(conversationApi.detail).mockResolvedValue({
      session_stats: null,
    } as never);

    const { container } = renderStrip('conversation-1');

    await waitFor(() => {
      expect(conversationApi.detail).toHaveBeenCalledWith('conversation-1');
    });
    expect(container.querySelector('[data-testid="session-usage-stats"]'))
      .toBeNull();
  });

  it('renders nothing without a conversation', () => {
    const { container } = renderStrip(null);

    expect(container.querySelector('[data-testid="session-usage-stats"]'))
      .toBeNull();
    expect(conversationApi.detail).not.toHaveBeenCalled();
  });
});
