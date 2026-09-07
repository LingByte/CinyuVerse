import {
  Component,
  useCallback,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Optional fallback render. If not provided, uses the default compact
   * error card.
   */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /**
   * Label shown in the default error card. Defaults to a generic
   * "Something went wrong" message.
   */
  label?: string;
  /** Extra className for the default error card wrapper. */
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Reusable error boundary with a compact, user-friendly error card.
 *
 * Shows the error message (not the full component stack) by default,
 * with a "Show details" toggle for developers. The "Retry" button
 * resets the boundary without a full page reload.
 *
 * Usage:
 *   <ErrorBoundary label="Overview">
 *     <NovelOverviewPanel />
 *   </ErrorBoundary>
 */
class ErrorBoundaryInner extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? '', error);
    this.setState({ errorInfo });
  }

  retry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.retry);
      }
      return (
        <ErrorCard
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          label={this.props.label}
          className={this.props.className}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}

function ErrorCard({
  error,
  errorInfo,
  label,
  className,
  onRetry,
}: {
  error: Error;
  errorInfo: ErrorInfo | null;
  label?: string;
  className?: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation('common');
  const [showDetails, setShowDetails] = useState(false);

  const toggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  return (
    <div
      className={
        'flex h-full w-full flex-col items-center justify-center gap-3 p-6 ' +
        (className ?? '')
      }
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">
            {label
              ? t('errorBoundary.panelTitle', {
                  defaultValue: '{{label}} 出错',
                  label,
                })
              : t('errorBoundary.genericTitle', {
                  defaultValue: '发生错误',
                })}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {error.message || t('errorBoundary.unknown', {
            defaultValue: '未知错误',
          })}
        </p>

        {showDetails && errorInfo?.componentStack ? (
          <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground">
            {error.stack || error.message}
            {'\n\nComponent stack:'}
            {errorInfo.componentStack}
          </pre>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RotateCw className="h-3 w-3" />
            {t('errorBoundary.retry', { defaultValue: '重试' })}
          </button>
          <button
            onClick={toggleDetails}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {showDetails ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {showDetails
              ? t('errorBoundary.hideDetails', { defaultValue: '隐藏详情' })
              : t('errorBoundary.showDetails', { defaultValue: '显示详情' })}
          </button>
        </div>
      </div>
    </div>
  );
}

export const ErrorBoundary = ErrorBoundaryInner;
