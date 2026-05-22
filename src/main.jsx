import { StrictMode } from 'react';
import { createRoot }  from 'react-dom/client';
import { AppProvider } from './core/AppContext.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { initDeploymentGuard } from './diagnostics/deploymentGuard.js';
import App from './app/App.jsx';
import './styles/global.css';

// Hide splash loader once React is ready
function hideLoader() {
  if (typeof window.__hideLoader === 'function') window.__hideLoader();
}

// Run deployment checks (non-blocking)
initDeploymentGuard().catch(() => {});

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <AppProvider>
      <ToastProvider>
        <App onReady={hideLoader} />
      </ToastProvider>
    </AppProvider>
  </StrictMode>
);
