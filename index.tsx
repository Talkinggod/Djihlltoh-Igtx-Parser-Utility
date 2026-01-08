import React, { Component, ReactNode, ErrorInfo } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("Starting application mount...");

const rootElement = document.getElementById('root');

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declare props to satisfy strict TypeScript checks if Component generic inference fails
  declare props: Readonly<ErrorBoundaryProps>;

  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh', 
          backgroundColor: '#0f172a', 
          color: '#e2e8f0', 
          fontFamily: 'sans-serif', 
          padding: '2rem', 
          textAlign: 'center'
        }}>
          <div style={{ marginBottom: '1rem', color: '#ef4444' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Something went wrong</h1>
          <p style={{ maxWidth: '600px', marginBottom: '2rem', color: '#94a3b8' }}>
            The application encountered a critical error and could not load.
          </p>
          <div style={{ 
            backgroundColor: '#1e293b', 
            padding: '1rem', 
            borderRadius: '0.5rem', 
            fontFamily: 'monospace', 
            fontSize: '0.875rem', 
            textAlign: 'left',
            overflow: 'auto',
            maxWidth: '100%',
            border: '1px solid #334155'
          }}>
            {this.state.error?.message || "Unknown Error"}
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '2rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

try {
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  const root = ReactDOM.createRoot(rootElement);
  console.log("Root created, rendering...");
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  console.log("Render scheduled.");
} catch (e: any) {
  console.error("Fatal initialization error:", e);
  if (rootElement) {
     rootElement.innerHTML = `
        <div style="padding: 2rem; color: #ef4444; background: #0f172a; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
            <h1 style="font-size: 1.5rem; margin-bottom: 1rem;">Fatal Init Error</h1>
            <p>${e.message}</p>
        </div>
     `;
  }
}