import { useState, useEffect } from 'react';
import {
  Box, AppBar, Toolbar, Typography,
  Container, Tabs, Tab, Chip, Snackbar, Alert, GlobalStyles,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  FiberManualRecord as DotIcon,
} from '@mui/icons-material';
import Dashboard from './components/Dashboard.js';
import ApiSettings from './components/ApiSettings.js';

const spinKeyframes = `
  @keyframes borderSpin {
    0%   { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }
`;

export default function App() {
  const [tab, setTab] = useState(0);
  const [port, setPort] = useState(3456);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false, message: '', severity: 'info',
  });

  const refreshPort = async () => {
    try {
      const p = await window.api?.getPort?.();
      if (p) setPort(p);
    } catch {}
  };

  useEffect(() => {
    refreshPort();
    const i = setInterval(refreshPort, 5000);
    return () => clearInterval(i);
  }, []);

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'info' = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <>
      <GlobalStyles styles={spinKeyframes} />

      {/* Outer border wrapper */}
      <Box sx={{
        height: '100vh',
        p: '2px',
        bgcolor: 'transparent',
        borderRadius: '16px',
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
      }}>
        {/* Spinning beam behind everything */}
        <Box sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '16px',
          overflow: 'hidden',
          zIndex: 0,
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '200%',
            height: '200%',
            background: `conic-gradient(
              from 0deg,
              transparent 0deg,
              #00FFFF 15deg,
              transparent 60deg,
              transparent 180deg,
              #FFA500 195deg,
              transparent 240deg,
              transparent 360deg
            )`,
            animation: 'borderSpin 4s linear infinite',
            willChange: 'transform',
            filter: 'blur(4px)',
          },
        }} />

        {/* Inner content area (masks the center of the beam) */}
        <Box sx={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: '#0a0b10',
          borderRadius: '14px',
          overflow: 'hidden',
        }}>
          <AppBar position="static" elevation={0} sx={{ bgcolor: 'rgba(10,11,16,0.95)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <Toolbar sx={{ gap: 2 }}>
              <Box component="img" src="./logo.png" sx={{ width: 32, height: 32, borderRadius: 1 }} />
              <Typography variant="h6" sx={{ flexGrow: 0, fontWeight: 700, background: 'linear-gradient(135deg, #00FFFF, #FFA500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                BridgeLM
              </Typography>
              <Chip
                icon={<DotIcon sx={{ fontSize: 10, color: 'success.main' }} />}
                label={`Port ${port}`}
                size="small"
                variant="outlined"
                sx={{ borderColor: 'rgba(255,255,255,0.1)' }}
              />
              <Box sx={{ flexGrow: 1 }} />
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 48 }}>
                <Tab icon={<DashboardIcon />} label="Providers" sx={{ minHeight: 48 }} />
                <Tab icon={<SettingsIcon />} label="Settings" sx={{ minHeight: 48 }} />
              </Tabs>
            </Toolbar>
          </AppBar>

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Container maxWidth="lg" sx={{ py: 3 }}>
              {tab === 0 && <Dashboard onSnackbar={showSnackbar} port={port} />}
              {tab === 1 && <ApiSettings onSnackbar={showSnackbar} />}
            </Container>
          </Box>

          <Snackbar
            open={snackbar.open}
            autoHideDuration={3000}
            onClose={() => setSnackbar(s => ({ ...s, open: false }))}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          >
            <Alert severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>
              {snackbar.message}
            </Alert>
          </Snackbar>
        </Box>
      </Box>
    </>
  );
}
