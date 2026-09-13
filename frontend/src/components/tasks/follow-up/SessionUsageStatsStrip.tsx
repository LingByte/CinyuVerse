import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { conversationApi } from '@/features/conversation/conversationApi';
import { listenToConversationEvents } from '@/features/conversation/events';
import { formatUsageCost, formatUsageNumber } from '@/lib/usageFormat';
import type { SessionStats } from 'shared/types';

const USAGE_STATS_QUERY_KEY = 'conversation-session-stats';
// Live batches arrive per streamed row; one refresh per quiet period is enough.
const REFRESH_DEBOUNCE_MS = 1500;

export function SessionUsageStatsStrip({
  conversationId,
}: {
  conversationId: string | null | undefined;
}) {
  const { t } = useTranslation('tasks');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = listenToConversationEvents(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (!disposed) {
          void queryClient.invalidateQueries({
            queryKey: [USAGE_STATS_QUERY_KEY, conversationId],
          });
        }
      }, REFRESH_DEBOUNCE_MS);
    }, conversationId);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      void unsubscribe.then((dispose) => dispose());
    };
  }, [conversationId, queryClient]);

  const { data: stats } = useQuery({
    queryKey: [USAGE_STATS_QUERY_KEY, conversationId],
    queryFn: async (): Promise<SessionStats | null> => {
      if (!conversationId) return null;
      const detail = await conversationApi.detail(conversationId);
      return detail?.session_stats ?? null;
    },
    enabled: Boolean(conversationId),
    staleTime: 5_000,
  });

  // ADR-0058: stats are absent when the agent never reported usage. Missing
  // stays missing — no strip, no zero-filled breakdown.
  const usage = stats?.total_usage;
  if (!conversationId || !usage) return null;

  const inputTokens = Number(usage.input_tokens);
  const outputTokens = Number(usage.output_tokens);
  const cacheReadTokens = Number(usage.cache_read_input_tokens);
  const cacheWriteTokens = Number(usage.cache_creation_input_tokens);
  const totalTokens =
    stats?.total_tokens != null
      ? Number(stats.total_tokens)
      : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;

  const segments: Array<{ label: string; value: string }> = [];
  if (inputTokens > 0) {
    segments.push({
      label: t('sessionUsageStats.input'),
      value: formatUsageNumber(inputTokens),
    });
  }
  if (outputTokens > 0) {
    segments.push({
      label: t('sessionUsageStats.output'),
      value: formatUsageNumber(outputTokens),
    });
  }
  if (cacheReadTokens > 0) {
    segments.push({
      label: t('sessionUsageStats.cacheRead'),
      value: formatUsageNumber(cacheReadTokens),
    });
  }
  if (cacheWriteTokens > 0) {
    segments.push({
      label: t('sessionUsageStats.cacheWrite'),
      value: formatUsageNumber(cacheWriteTokens),
    });
  }
  if (totalTokens > 0) {
    segments.push({
      label: t('sessionUsageStats.total'),
      value: formatUsageNumber(totalTokens),
    });
  }
  if (usage.cost_amount != null) {
    segments.push({
      label: t('sessionUsageStats.cost'),
      value: formatUsageCost(Number(usage.cost_amount)),
    });
  }
  if (segments.length === 0) return null;

  return (
    <div
      className="mx-3 -mt-1 mb-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
      data-testid="session-usage-stats"
    >
      <span>{t('sessionUsageStats.label')}</span>
      {segments.map((segment) => (
        <span key={segment.label} className="flex items-center gap-1.5">
          <span aria-hidden="true">·</span>
          <span>
            {segment.label} {segment.value}
          </span>
        </span>
      ))}
    </div>
  );
}
