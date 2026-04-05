import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Still log the original error for debugging in the browser console
    console.error('Uncaught error in React tree:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center px-4">
            <h1 className="text-2xl md:text-3xl font-bold text-[#1e3a5f] mb-3">
              Something went wrong.
            </h1>
            <p className="text-gray-600 mb-2">
              The page failed to load correctly.
            </p>
            <p className="text-gray-500 text-sm">
              Please refresh the page or try again in a moment.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
