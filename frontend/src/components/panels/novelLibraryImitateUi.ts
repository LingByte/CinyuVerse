export type ImitateStatusPhase =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

export type ImitateStatusView = {
  phase: ImitateStatusPhase;
  step: number | null;
  stepTotal: number | null;
  progress: string | null;
  error: string | null;
  updatedAt: string;
  conversationId: string | null;
};

export function imitateStatusLabel(status: ImitateStatusView | null): string {
  if (!status) return '未分析';
  const stepPrefix =
    status.step != null && status.stepTotal != null
      ? `${status.step}/${status.stepTotal} · `
      : '';
  switch (status.phase) {
    case 'queued':
    case 'running':
      return `${stepPrefix}${status.progress || '分析中'}`;
    case 'completed':
      return '已拆出故事线/人物卡/写法';
    case 'failed':
      return status.error ? `失败：${status.error}` : '失败';
    case 'idle':
      return status.progress === '已中断' ? '已中断' : '未分析';
    default:
      return '未分析';
  }
}

export function imitateStepPercent(
  status: ImitateStatusView | null
): number | null {
  if (
    !status ||
    status.step == null ||
    status.stepTotal == null ||
    status.stepTotal <= 0
  ) {
    return null;
  }
  if (status.phase === 'completed') return 100;
  if (status.phase !== 'queued' && status.phase !== 'running') return null;
  return Math.min(100, Math.round((status.step / status.stepTotal) * 100));
}
