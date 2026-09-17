import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './AuthContext';
import './styles.css';

class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  handleReset() {
    localStorage.clear();
    window.location.href = '/login';
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '32px', fontFamily: 'Inter, sans-serif', maxWidth: 640 }}>
          <h2 style={{ marginBottom: 8 }}>Mini ERP hit an unexpected error</h2>
          <p>Please reset your saved session and reload.</p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: '#f4f4f5',
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {String(this.state.error && (this.state.error.message || this.state.error))}
          </pre>
          <button className="btn btn-primary" onClick={this.handleReset}>
            Clear data &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);