import { Component, createContext, useContext, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryContextValue {
  stackTrace: string | null;
  error: Error | null;
}

const ErrorBoundaryContext = createContext<ErrorBoundaryContextValue>({
  stackTrace: null,
  error: null,
});

export function useErrorBoundaryContext() {
  return useContext(ErrorBoundaryContext);
}

interface Props {
  children: ReactNode;
  fallback: (info: { error: Error; stackTrace: string | null }) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  stackTrace: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, stackTrace: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      stackTrace: error.stack || null,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, stackTrace: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <ErrorBoundaryContext.Provider
          value={{ stackTrace: this.state.stackTrace, error: this.state.error }}
        >
          {this.props.fallback({
            error: this.state.error,
            stackTrace: this.state.stackTrace,
          })}
        </ErrorBoundaryContext.Provider>
      );
    }

    return (
      <ErrorBoundaryContext.Provider value={{ stackTrace: null, error: null }}>
        {this.props.children}
      </ErrorBoundaryContext.Provider>
    );
  }
}