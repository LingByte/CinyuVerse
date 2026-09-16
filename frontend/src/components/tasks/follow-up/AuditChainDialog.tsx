import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type AuditChainScope = 'latest' | 'book' | 'chapter';

const SCOPE_OPTIONS: Array<{
  value: AuditChainScope;
  label: string;
  description: string;
}> = [
  { value: 'latest', label: '最新章节', description: '自动定位最新完成的章节' },
  {
    value: 'book',
    label: '全书',
    description: '从第一章到最新章，逐章审校修订',
  },
  { value: 'chapter', label: '手动输入', description: '指定要处理的章节号' },
];

type AuditChainDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: AuditChainScope, chapterNumber?: number) => void;
};

export function AuditChainDialog({
  open,
  onOpenChange,
  onConfirm,
}: AuditChainDialogProps) {
  const [scope, setScope] = useState<AuditChainScope>('latest');
  const [chapterInput, setChapterInput] = useState('');

  useEffect(() => {
    if (open) {
      setScope('latest');
      setChapterInput('');
    }
  }, [open]);

  const chapterNumber =
    scope === 'chapter' ? Number.parseInt(chapterInput, 10) : NaN;
  const confirmDisabled =
    scope === 'chapter' && !Number.isFinite(chapterNumber);

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm(
      scope,
      Number.isFinite(chapterNumber) ? chapterNumber : undefined
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>审校 → 修订 → 复检</DialogTitle>
          <DialogDescription>
            选择处理范围，生成对应的执行链提示词
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setScope(option.value)}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition-colors',
                scope === option.value
                  ? 'border-ring bg-accent/50'
                  : 'hover:bg-accent/30'
              )}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground">
                {option.description}
              </div>
            </button>
          ))}
          {scope === 'chapter' ? (
            <Input
              autoFocus
              inputMode="numeric"
              placeholder="章节号，如 16"
              value={chapterInput}
              onChange={(e) => setChapterInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !confirmDisabled) handleConfirm();
              }}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={confirmDisabled}>
            生成并发送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
