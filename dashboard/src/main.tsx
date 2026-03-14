import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: `${error.name}: ${error.message}\n${error.stack}` };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#0B0F14', color: '#D7FF2F', fontFamily: 'monospace', padding: 40, minHeight: '100vh' }}>
          <h1 style={{ fontSize: 24, marginBottom: 20 }}>[ SYSTEM_CRASH ]</h1>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#FF6A3D' }}>{this.state.error}</pre>
          <button
            onClick={() => { localStorage.removeItem('veist_auth'); window.location.reload(); }}
            style={{ marginTop: 20, background: '#D7FF2F', color: '#0B0F14', padding: '12px 24px', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'monospace', textTransform: 'uppercase' }}
          >
            CLEAR_AUTH &amp; RELOAD
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
