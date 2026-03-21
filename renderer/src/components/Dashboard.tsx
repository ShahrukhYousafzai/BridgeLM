import { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Chip, IconButton,
  LinearProgress, Tooltip, Alert, Divider, Switch, FormControlLabel, Container,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  CheckCircle as CheckIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenIcon,
  SmartToy as BotIcon,
  AutoAwesome as AutoIcon,
} from '@mui/icons-material';

const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek Web', url: 'https://chat.deepseek.com', icon: '🐋', color: '#4D6BFE',
    models: [{ id: 'deepseek-chat', name: 'DeepSeek V3', ctx: 64 }, { id: 'deepseek-reasoner', name: 'DeepSeek R1', ctx: 64, reasoning: true }] },
  { id: 'claude', name: 'Claude Web', url: 'https://claude.ai', icon: '🟠', color: '#D4A574',
    models: [{ id: 'claude-sonnet-4-6', name: 'Sonnet 4', ctx: 195 }, { id: 'claude-opus-4-6', name: 'Opus 4', ctx: 195, reasoning: true }, { id: 'claude-haiku-4-6', name: 'Haiku 4', ctx: 195 }] },
  { id: 'chatgpt', name: 'ChatGPT Web', url: 'https://chatgpt.com', icon: '⚫', color: '#10A37F',
    models: [{ id: 'gpt-4o', name: 'GPT-4o', ctx: 128 }, { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', ctx: 128 }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini', ctx: 128 }] },
  { id: 'gemini', name: 'Gemini Web', url: 'https://gemini.google.com/app', icon: '✴️', color: '#4285F4',
    models: [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', ctx: 1000 }, { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', ctx: 1000 }, { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', ctx: 1000 }] },
  { id: 'grok', name: 'Grok Web', url: 'https://grok.com', icon: '⬛', color: '#1DA1F2',
    models: [{ id: 'grok-3', name: 'Grok 3', ctx: 128 }, { id: 'grok-3-mini', name: 'Grok 3 Mini', ctx: 128 }] },
  { id: 'kimi', name: 'Kimi Web', url: 'https://kimi.moonshot.cn', icon: '🌙', color: '#FF6B35',
    models: [{ id: 'kimi-latest', name: 'Kimi Latest', ctx: 128 }, { id: 'moonshot-v1-8k', name: 'Moonshot 8K', ctx: 8 }, { id: 'moonshot-v1-32k', name: 'Moonshot 32K', ctx: 32 }, { id: 'moonshot-v1-128k', name: 'Moonshot 128K', ctx: 128 }] },
  { id: 'qwen', name: 'Qwen International', url: 'https://chat.qwen.ai', icon: '✨', color: '#FF6A00',
    models: [{ id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', ctx: 131 }, { id: 'qwen3.5-turbo', name: 'Qwen 3.5 Turbo', ctx: 131 }, { id: 'qwen-max', name: 'Qwen Max', ctx: 32 }] },
  { id: 'qwen-cn', name: 'Qwen China', url: 'https://www.qianwen.com', icon: '✨', color: '#FF6A00',
    models: [{ id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus', ctx: 131 }, { id: 'qwen3.5-turbo', name: 'Qwen 3.5 Turbo', ctx: 131 }] },
  { id: 'glm', name: 'GLM (智谱清言)', url: 'https://chatglm.cn', icon: '🧠', color: '#00D4AA',
    models: [{ id: 'glm-4-plus', name: 'GLM-4 Plus', ctx: 128 }, { id: 'glm-4-think', name: 'GLM-4 Think', ctx: 128, reasoning: true }] },
  { id: 'glm-intl', name: 'GLM International', url: 'https://chat.z.ai', icon: '🧠', color: '#00D4AA',
    models: [{ id: 'glm-4-plus', name: 'GLM-4 Plus', ctx: 128 }, { id: 'glm-4-think', name: 'GLM-4 Think', ctx: 128, reasoning: true }] },
  { id: 'doubao', name: 'Doubao Web', url: 'https://www.doubao.com/chat/', icon: '🤖', color: '#325AFF',
    models: [{ id: 'doubao-seed-2.0', name: 'Doubao Seed 2.0', ctx: 128 }, { id: 'doubao-pro-256k', name: 'Doubao Pro 256K', ctx: 256 }] },
];

interface DashboardProps {
  onSnackbar: (message: string, severity?: 'success' | 'error' | 'info') => void;
  port: number;
}

export default function Dashboard({ onSnackbar, port }: DashboardProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [connecting, setConnecting] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [activeProviders, setActiveProviders] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const data = await res.json() as { providers: Record<string, boolean> };
      setActiveProviders(Object.keys(data.providers || {}));
    } catch {}
  }, [port]);

  useEffect(() => { refresh(); const i = setInterval(refresh, 10000); return () => clearInterval(i); }, [refresh]);

  const handleConnect = useCallback(async (providerId: string) => {
    if (window.api?.autoLogin) {
      setConnecting(providerId);
      setProgress('Launching browser...');
      try {
        const result = await window.api.autoLogin(providerId);
        if (result.success) {
          onSnackbar('Connected!', 'success');
          setActiveProviders(prev => prev.includes(providerId) ? prev : [...prev, providerId]);
          setTimeout(refresh, 1000);
        } else {
          onSnackbar(`Failed: ${result.error}`, 'error');
        }
      } catch (e: any) {
        onSnackbar(`Error: ${e.message}`, 'error');
      }
      setConnecting(null);
      setProgress('');
    } else {
      window.open(PROVIDERS.find(p => p.id === providerId)?.url, '_blank');
    }
  }, [onSnackbar, refresh, port]);

  const handleRemove = async (id: string) => {
    if (window.api?.removeProvider) await window.api.removeProvider(id);
    setActiveProviders(a => a.filter(p => p !== id));
    onSnackbar('Removed', 'info');
  };

  const handleAutoRefreshToggle = async (enabled: boolean) => {
    setAutoRefresh(enabled);
    if (enabled) {
      await window.api?.startAutoRefresh?.(10);
      onSnackbar('Auto-Update Cookies ON — refreshed every 10 min', 'success');
    } else {
      await window.api?.stopAutoRefresh?.();
      onSnackbar('Auto-Update Cookies OFF', 'info');
    }
  };

  const renderCard = (p: typeof PROVIDERS[0], isActive: boolean, isConnecting: boolean) => (
    <Card sx={{
      opacity: isActive ? 0.5 : 1,
      borderLeft: `3px solid ${p.color}`,
      height: '100%',
      '&:hover': isActive ? {} : { transform: 'translateY(-2px)', boxShadow: 4 },
      transition: 'all 0.15s',
    }}>
      <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="h6" sx={{ fontSize: 24 }}>{p.icon}</Typography>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{p.name}</Typography>
            <Typography variant="caption" color="text.secondary">{new URL(p.url).hostname}</Typography>
          </Box>
          {isActive && <Chip label="Connected" size="small" color="success" variant="outlined" />}
        </Box>

        <Box sx={{ mb: 1 }}>
          {p.models.slice(0, expanded[p.id] ? 999 : 2).map(m => (
            <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
              <BotIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>{m.name}</Typography>
              {m.reasoning && <Chip label="Reasoning" size="small" sx={{ fontSize: 9, height: 18 }} color="info" />}
              <Chip label={`${m.ctx}k`} size="small" sx={{ fontSize: 9, height: 18, borderColor: 'rgba(255,255,255,0.08)' }} variant="outlined" />
            </Box>
          ))}
          {p.models.length > 2 && (
            <Button size="small" sx={{ fontSize: 11, p: 0, minWidth: 'auto' }}
              onClick={() => setExpanded(e => ({ ...e, [p.id]: !e[p.id] }))}>
              {expanded[p.id] ? '▲ Less' : `▼ +${p.models.length - 2} more`}
            </Button>
          )}
        </Box>

        <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.06)' }} />

        {isConnecting && (
          <Box sx={{ mb: 1.5 }}>
            <LinearProgress sx={{ borderRadius: 1, mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">
              <AutoIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
              {progress || 'Connecting...'}
            </Typography>
          </Box>
        )}

        <Button
          fullWidth
          variant={isActive ? 'outlined' : 'contained'}
          startIcon={isActive ? <CheckIcon /> : <AutoIcon />}
          onClick={() => handleConnect(p.id)}
          disabled={isActive || !!connecting}
          sx={{
            mt: 'auto',
            background: isActive ? undefined : `linear-gradient(135deg, ${p.color}, ${p.color}CC)`,
          }}
        >
          {isActive ? 'Connected' : isConnecting ? 'Connecting...' : 'Connect (Auto)'}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h5" sx={{ mb: 0.5 }}>AI Providers</Typography>
          <Typography variant="body2" color="text.secondary">
            Click <strong>Connect</strong> — Chrome opens → Login → We auto-capture cookies
            <br />
            API: <code style={{ color: '#74B9FF' }}>http://127.0.0.1:{port}/v1/chat/completions</code>
          </Typography>
        </Box>
        <FormControlLabel
          control={<Switch checked={autoRefresh} onChange={(_, v) => handleAutoRefreshToggle(v)} color="primary" />}
          label={<Typography variant="body2" color="text.secondary">Auto-Update Cookies</Typography>}
          sx={{ mr: 1 }}
        />
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refresh} size="small">Refresh</Button>
      </Box>

      {/* Connected Providers */}
      {activeProviders.length > 0 && (
        <Box sx={{ mb: 5 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
            Connected ({activeProviders.length})
          </Typography>
          <Grid container columnSpacing={4} rowSpacing={4} justifyContent="center" alignItems="stretch">
            {activeProviders.map(id => {
              const p = PROVIDERS.find(x => x.id === id);
              if (!p) return null;
              return (
                <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={id}>
                  {renderCard(p, true, false)}
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}

      {/* Available Providers */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
        Available Providers
      </Typography>
      <Grid container columnSpacing={4} rowSpacing={4} justifyContent="center" alignItems="stretch">
        {PROVIDERS.map(p => {
          const isActive = activeProviders.includes(p.id);
          const isConnecting = connecting === p.id;
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={p.id}>
              {renderCard(p, isActive, isConnecting)}
            </Grid>
          );
        })}
      </Grid>

      <Alert severity="info" sx={{ mt: 4, borderRadius: 2 }}>
        <Typography variant="body2">
          <strong>How it works:</strong> Click "Connect" → Chrome opens → Login to the platform → We automatically capture your session cookies and tokens → You're done!
          <br />
          No manual cookie copying. No API keys needed. Everything is automatic.
        </Typography>
      </Alert>
    </Container>
  );
}
