import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Play,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  WritingGuideStep,
  WritingGuideStepId,
} from '@/hooks/useWritingPipelineProgress';

type WritingGuideCardProps = {
  steps: WritingGuideStep[];
  /** Whether a step's action can run right now (e.g. write needs a current beat). */
  canRun: (id: WritingGuideStepId) => boolean;
  onAction: (id: WritingGuideStepId) => void;
};

export function WritingGuideCard({
  steps,
  canRun,
  onAction,
}: WritingGuideCardProps) {
  const { t } = useTranslation('panels');
  const [expandedId, setExpandedId] = useState<WritingGuideStepId | null>(null);

  return (
    <div className="mx-4 mb-2 rounded-md border bg-background/50">
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {t('panels:overview.guideTitle')}
      </div>
      <ul className="flex flex-col gap-0.5 px-2 pb-2">
        {steps.map((step) => {
          const label = t(`panels:overview.guideStep.${step.id}`);
          const disabled = !canRun(step.id);
          const expanded = expandedId === step.id;
          return (
            <li key={step.id} className="rounded px-1 py-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : step.id)}
                >
                  {expanded ? (
                    <ChevronDown
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronRight
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  {step.done ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                      aria-hidden="true"
                    />
                  ) : step.active ? (
                    <CircleDot
                      className="h-3.5 w-3.5 shrink-0 text-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      'truncate text-xs',
                      step.active ? 'font-medium' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                    {step.optional ? (
                      <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                        {t('panels:overview.guideOptional')}
                      </span>
                    ) : null}
                  </span>
                </button>
                {!step.done ? (
                  <Button
                    size="sm"
                    variant={step.active ? 'secondary' : 'ghost'}
                    className="h-6 shrink-0 px-2 text-xs"
                    onClick={() => onAction(step.id)}
                    disabled={disabled}
                  >
                    <Play className="h-3 w-3" />
                    {t('panels:overview.guideStart')}
                  </Button>
                ) : null}
              </div>
              {expanded ? (
                <p className="mt-1 pl-8 pr-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t(`panels:overview.guideStepDesc.${step.id}`)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="px-3 pb-1.5 text-[10px] text-muted-foreground/60">
        {t('panels:overview.guidePipelineHint')}
      </div>
    </div>
  );
}
