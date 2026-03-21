import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Alert, Chip, IconButton,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Save as SaveIcon,
  VpnKey as KeyIcon,
  Router as RouterIcon,
  Code as CodeIcon,
} from '@mui/icons-material';

interface ApiSettingsProps {
  onSnackbar: (message: string, severity?: 'success' | 'error' | 'info') => void;
}

export default function ApiSettings({ onSnackbar }: ApiSettingsProps) {
  const [port, setPort] = useState('3456');
  const [apiKey, setApiKey] = useState('secret');

  useEffect(() => {
    window.api?.getPort?.().then((p: number) => setPort(String(p))).catch(() => {});
    window.api?.getApiKey?.().then((k: string) => setApiKey(k)).catch(() => {});
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onSnackbar(`${label} copied`, 'success');
  };

  const handleSavePort = async () => {
    await window.api?.setPort?.(Number(port));
    onSnackbar(`Port changed to ${port}. Server restarted.`, 'success');
  };

  const handleSaveApiKey = async () => {
    await window.api?.setApiKey?.(apiKey);
    onSnackbar('API key updated', 'success');
  };

  const baseUrl = `http://127.0.0.1:${port}`;
  const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"deepseek/deepseek-chat","messages":[{"role":"user","content":"Hello!"}],"stream":false}'`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3, px: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 1200 }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Configure the API gateway server
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>

          {/* Left column - Config */}
          <Box sx={{ flex: '1 1 400px', minWidth: 320 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <RouterIcon color="primary" />
                  <Typography variant="h6">Server</Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <TextField
                    label="Port"
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    type="number"
                    size="small"
                    sx={{ width: 140 }}
                    helperText="Default: 3456"
                  />
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSavePort}
                    size="small"
                    sx={{ mt: 0.5 }}
                  >
                    Save
                  </Button>
                </Box>

                <Box sx={{ mt: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <KeyIcon color="primary" />
                    <Typography variant="h6">API Key</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    <TextField
                      label="API Key"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      size="small"
                      sx={{ flex: 1, minWidth: 200 }}
                      placeholder="Enter any secret key"
                    />
                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveApiKey}
                      size="small"
                      sx={{ mt: 0.5 }}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => copy(apiKey, 'API Key')}
                      startIcon={<CopyIcon />}
                      size="small"
                      sx={{ mt: 0.5 }}
                    >
                      Copy
                    </Button>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    Include in requests as: Authorization: Bearer &lt;your-key&gt;
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Right column - Usage */}
          <Box sx={{ flex: '1 1 400px', minWidth: 320 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CodeIcon color="primary" />
                  <Typography variant="h6">API Usage</Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Base URL
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                  <Chip label={baseUrl} variant="outlined" sx={{ fontFamily: 'monospace', flex: 1 }} />
                  <IconButton size="small" onClick={() => copy(baseUrl, 'Base URL')}>
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  cURL Example
                </Typography>
                <Box sx={{
                  bgcolor: 'rgba(0,0,0,0.3)',
                  borderRadius: 2,
                  p: 2,
                  position: 'relative',
                  mb: 2,
                }}>
                  <pre style={{
                    margin: 0,
                    fontSize: 12,
                    fontFamily: '"JetBrains Mono", monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: '#E8E8E8',
                    lineHeight: 1.6,
                  }}>
                    {curlExample}
                  </pre>
                  <IconButton
                    size="small"
                    onClick={() => copy(curlExample, 'cURL')}
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Box>

                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  <Typography variant="body2">
                    <strong>Model:</strong> <code>provider/model-id</code> — e.g. <code>deepseek/deepseek-chat</code>
                  </Typography>
                </Alert>

                <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {['GET /v1/models', 'POST /v1/chat/completions', 'GET /health'].map(ep => (
                    <Chip key={ep} label={ep} variant="outlined" size="small"
                      sx={{ fontFamily: 'monospace', fontSize: 11, borderColor: 'rgba(255,255,255,0.1)' }} />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Box>

        </Box>
      </Box>
    </Box>
  );
}
