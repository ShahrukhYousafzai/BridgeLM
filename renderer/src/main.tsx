import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, CssBaseline, Box, Typography, Alert } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { theme } from './theme/theme.js';
import App from './App.js';

// Fallback API for when preload doesn't load (e.g. running outside Electron)
if (typeof window !== 'undefined' && !(window as any).api) {
  (window as any).api = {
    getConfig: () => Promise.resolve({}),
    getPort: () => Promise.resolve(3456),
    getApiKey: () => Promise.resolve('fg-dev'),
    setPort: () => Promise.resolve(true),
    setApiKey: () => Promise.resolve(true),
    regenerateApiKey: () => Promise.resolve('fg-regenerated'),
    listProviders: () => Promise.resolve([]),
    activeProviders: () => Promise.resolve({}),
    enableProvider: () => Promise.resolve(true),
    removeProvider: () => Promise.resolve(true),
    autoLogin: () => Promise.resolve({ success: false, error: 'Not in Electron' }),
    onAuthProgress: () => () => {},
    getStatus: () => Promise.resolve({ gatewayPort: 3456, gatewayApiKey: 'fg-dev', providerCount: 0, providers: {} }),
    openUrl: (url: string) => { window.open(url, '_blank'); return Promise.resolve(true); },
    listModels: () => Promise.resolve([]),
    startAutoRefresh: () => Promise.resolve(true),
    stopAutoRefresh: () => Promise.resolve(true),
    getAutoRefreshStatus: () => Promise.resolve({ enabled: false }),
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
