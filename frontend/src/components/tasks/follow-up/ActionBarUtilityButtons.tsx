import { Archive, Lightbulb, ListChecks, Loader2, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

const COMPACT_CONTEXT_LABEL = '\u538b\u7f29\u4e0a\u4e0b\u6587';
const ENHANCE_PROMPT_LABEL = '\u63d0\u793a\u8bcd\u4f18\u5316';
const AUDIT_CHAIN_LABEL = '审校→修订→复检';
const DISTILL_STYLE_LABEL = '提炼文风';

type ActionBarUtilityButtonsProps = {
  canCompactContext: boolean;
  isCompactingContext: boolean;
  promptEnhancementEnabled: boolean;
  isEnhancingPrompt: boolean;
  canEnhancePrompt: boolean;
  onCompactContext: () => void;
  onEnhancePrompt: () => void;
  onAuditReviseRecheck?: () => void;
  onDistillStyle?: () => void;
};

export function ActionBarUtilityButtons({
  canCompactContext,
  isCompactingContext,
  promptEnhancementEnabled,
  isEnhancingPrompt,
  canEnhancePrompt,
  onCompactContext,
  onEnhancePrompt,
  onAuditReviseRecheck,
  onDistillStyle,
}: ActionBarUtilityButtonsProps) {
  return (
    <>
      <Button
        onClick={onCompactContext}
        disabled={!canCompactContext || isCompactingContext}
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        title={COMPACT_CONTEXT_LABEL}
        aria-label={COMPACT_CONTEXT_LABEL}
      >
        {isCompactingContext ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
      </Button>

      {promptEnhancementEnabled ? (
        <Button
          onClick={onEnhancePrompt}
          disabled={!canEnhancePrompt || isEnhancingPrompt}
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          title={ENHANCE_PROMPT_LABEL}
          aria-label={ENHANCE_PROMPT_LABEL}
        >
          {isEnhancingPrompt ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Lightbulb className="h-3.5 w-3.5" />
          )}
        </Button>
      ) : null}

      <Button
        onClick={() => onAuditReviseRecheck?.()}
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        title={AUDIT_CHAIN_LABEL}
        aria-label={AUDIT_CHAIN_LABEL}
      >
        <ListChecks className="h-3.5 w-3.5" />
      </Button>

      <Button
        onClick={() => onDistillStyle?.()}
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        title={DISTILL_STYLE_LABEL}
        aria-label={DISTILL_STYLE_LABEL}
      >
        <Wand2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}
