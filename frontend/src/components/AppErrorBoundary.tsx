import { Component, useCallback, useState, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Top-level error boundary that catches uncaught React errors and prevents
 * a full white-screen crash. Shows a compact error card with the error
 * message and an optional details toggle (instead of dumping the full
 * component stack by default).
 */
class AppErrorBoundaryInner extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary] Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  retry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-foreground">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h1 className="text-lg font-semibold">
                {t('errorBoundary.title', { defaultValue: '页面发生错误' })}
              </h1>
            </div>

            <p className="text-sm text-muted-foreground">
              {t('errorBoundary.description', {
                defaultValue: '应用遇到了未预期的错误。请刷新页面或点击下方按钮重试。',
              })}
            </p>

            {this.state.error ? (
              <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                {this.state.error.message}
              </p>
            ) : null}

            <AppErrorDetails error={this.state.error} errorInfo={this.state.errorInfo} />

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <RotateCw className="h-3.5 w-3.5" />
                {t('errorBoundary.refresh', { defaultValue: '刷新页面' })}
              </button>
              <button
                onClick={this.retry}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('errorBoundary.retry', { defaultValue: '重试' })}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppErrorDetails({
  error,
  errorInfo,
}: {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const toggle = useCallback(() => setShowDetails((p) => !p), []);

  if (!errorInfo?.componentStack && !error?.stack) return null;

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {showDetails ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {showDetails ? '隐藏详情' : '显示详情'}
      </button>
      {showDetails ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-3 text-[10px] leading-relaxed text-muted-foreground">
          {error?.stack || error?.message || ''}
          {errorInfo?.componentStack
            ? '\n\nComponent stack:' + errorInfo.componentStack
            : ''}
        </pre>
      ) : null}
    </div>
  );
}

export const AppErrorBoundary = withTranslation(['app', 'common'])(
  AppErrorBoundaryInner
);
