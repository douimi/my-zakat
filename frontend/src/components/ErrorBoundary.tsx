import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.setState({
      error,
      errorInfo
    })
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div role="alert" className="card max-w-md w-full text-center">
            <AlertCircle aria-hidden="true" className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">
              An unexpected error stopped this page. Reloading usually fixes it.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details className="text-left mb-4 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-40">
                <summary className="font-semibold mb-2 cursor-pointer">Error Details</summary>
                <pre className="whitespace-pre-wrap break-words">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button type="button" onClick={this.handleReload} className="btn-primary gap-2">
                <RefreshCw aria-hidden="true" className="w-4 h-4" />
                Reload Page
              </button>
              {/* A full page load, not a router <Link>: the boundary sits above the routes and
                  would keep showing this screen after a client-side navigation. */}
              <a href="/" className="btn-secondary gap-2">
                <Home aria-hidden="true" className="w-4 h-4" />
                Go Home
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
