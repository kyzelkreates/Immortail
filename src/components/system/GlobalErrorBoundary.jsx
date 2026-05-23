/**
 * Immortail™ — GlobalErrorBoundary  v1.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Catches any unhandled render/lifecycle error anywhere in the React tree.
 * Prevents blank screens by showing a warm recovery UI with auto-redirect.
 *
 * Must be a class component — React error boundaries require componentDidCatch.
 * Mounted in App.jsx wrapping the entire BrowserRouter.
 */
import { Component } from 'react';

const SAFE_ROUTE = '/';  // always safe — LandingPage is public with no data deps

export default class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError:   false,
      errorMsg:   '',
      recovering: false,
    };
    this._recoveryTimer = null;
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMsg: error?.message || 'Unknown error',
    };
  }

  componentDidCatch(error, info) {
    // Log for debugging without crashing
    console.error('[Immortail] Render error caught by boundary:', error);
    console.error('[Immortail] Component stack:', info?.componentStack);

    // Auto-recover after 2.5s — navigate to safe route
    this._recoveryTimer = setTimeout(() => {
      this.setState({ recovering: true });
      // Hard navigate — clears all React state, starts fresh at landing
      setTimeout(() => {
        window.location.href = SAFE_ROUTE;
      }, 600); // brief pause so "recovering" animation plays
    }, 2500);
  }

  componentWillUnmount() {
    clearTimeout(this._recoveryTimer);
  }

  handleRetry = () => {
    clearTimeout(this._recoveryTimer);
    this.setState({ hasError: false, errorMsg: '', recovering: false });
  };

  handleHome = () => {
    clearTimeout(this._recoveryTimer);
    window.location.href = SAFE_ROUTE;
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { recovering, errorMsg } = this.state;

    return (
      <div
        style={{
          minHeight:       '100vh',
          background:      'radial-gradient(ellipse at 30% 40%, #0D0A1A 0%, #08060F 60%, #04030A 100%)',
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          justifyContent:  'center',
          padding:         '2rem',
          fontFamily:      'system-ui, -apple-system, sans-serif',
          textAlign:       'center',
          color:           '#E8DFC8',
        }}
      >
        {/* Animated paw */}
        <div
          style={{
            fontSize:   '4rem',
            marginBottom: '1.5rem',
            animation: recovering
              ? 'none'
              : 'immortailPulse 2s ease-in-out infinite',
          }}
        >
          {recovering ? '🌿' : '🐾'}
        </div>

        <h2
          style={{
            fontFamily:   'Georgia, serif',
            fontSize:     '1.4rem',
            fontWeight:   '400',
            color:        '#E8DFC8',
            marginBottom: '0.75rem',
          }}
        >
          {recovering ? 'Restoring your experience…' : 'Rebuilding your experience…'}
        </h2>

        <p
          style={{
            fontSize:     '0.9rem',
            color:        'rgba(232,223,200,0.5)',
            marginBottom: '2rem',
            maxWidth:     '280px',
            lineHeight:   '1.6',
          }}
        >
          {recovering
            ? 'Returning to a safe screen.'
            : 'Something interrupted the experience. Your memories are safe.'}
        </p>

        {/* Progress bar that fills during auto-recovery */}
        {!recovering && (
          <div
            style={{
              width:        '200px',
              height:       '2px',
              background:   'rgba(255,255,255,0.08)',
              borderRadius: '1px',
              overflow:     'hidden',
              marginBottom: '2rem',
            }}
          >
            <div
              style={{
                height:     '100%',
                background: 'linear-gradient(90deg, #C9A84C, #E8C76A)',
                borderRadius: '1px',
                animation:  'immortailFill 2.5s linear forwards',
              }}
            />
          </div>
        )}

        {/* Buttons — only shown during non-recovering state */}
        {!recovering && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding:      '0.6rem 1.2rem',
                borderRadius: '999px',
                border:       '1px solid rgba(201,168,76,0.3)',
                background:   'rgba(201,168,76,0.1)',
                color:        '#C9A84C',
                fontSize:     '0.85rem',
                cursor:       'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={this.handleHome}
              style={{
                padding:      '0.6rem 1.2rem',
                borderRadius: '999px',
                border:       '1px solid rgba(255,255,255,0.1)',
                background:   'transparent',
                color:        'rgba(232,223,200,0.5)',
                fontSize:     '0.85rem',
                cursor:       'pointer',
              }}
            >
              Return home
            </button>
          </div>
        )}

        {/* Inline keyframes — no CSS file dependency */}
        <style>{`
          @keyframes immortailPulse {
            0%, 100% { opacity: 0.7; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.08); }
          }
          @keyframes immortailFill {
            from { width: 0%; }
            to   { width: 100%; }
          }
        `}</style>
      </div>
    );
  }
}
