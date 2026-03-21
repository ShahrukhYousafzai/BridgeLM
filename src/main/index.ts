import { app, BrowserWindow, ipcMain, shell, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGatewayServer } from '../gateway/server';
import { ProviderManager } from '../gateway/provider-manager';
import { ConfigStore } from '../config/store';
import { closeSharedBrowser } from '../browser/auto-login';

// ESM shim for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let gatewayServer: any = null;
let providerManager: ProviderManager;
let configStore: ConfigStore;
let authInProgress: Record<string, boolean> = {};
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
let autoRefreshEnabled = false;
const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 30 minutes

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Map provider IDs to their auth module startAutoLogin functions
async function getAutoLoginFn(providerId: string) {
  const modules: Record<string, () => Promise<any>> = {
    'deepseek': async () => (await import('../providers/deepseek/auth.js')).startAutoLogin,
    'claude': async () => (await import('../providers/claude/auth.js')).startAutoLogin,
    'chatgpt': async () => (await import('../providers/chatgpt/auth.js')).startAutoLogin,
    'gemini': async () => (await import('../providers/gemini/auth.js')).startAutoLogin,
    'grok': async () => (await import('../providers/grok/auth.js')).startAutoLogin,
    'kimi': async () => (await import('../providers/kimi/auth.js')).startAutoLogin,
    'qwen': async () => (await import('../providers/qwen/auth.js')).startAutoLogin,
    'qwen-cn': async () => (await import('../providers/qwen-cn/auth.js')).startAutoLogin,
    'glm': async () => (await import('../providers/glm/auth.js')).startAutoLogin,
    'glm-intl': async () => (await import('../providers/glm-intl/auth.js')).startAutoLogin,
    'doubao': async () => (await import('../providers/doubao/auth.js')).startAutoLogin,
  };

  const loader = modules[providerId];
  if (!loader) throw new Error(`Unknown provider: ${providerId}`);
  return loader();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'BridgeLM',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0f1117',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startGateway(): Promise<void> {
  configStore = new ConfigStore();
  providerManager = new ProviderManager();

  // Restore saved provider credentials
  for (const providerId of configStore.getEnabledProviders()) {
    const creds = configStore.getProviderCredentials(providerId);
    if (creds) {
      try {
        providerManager.registerProvider(providerId, creds as any);
      } catch (err) {
        console.warn(`[Main] Failed to restore provider ${providerId}:`, err);
      }
    }
  }

  // Start gateway server
  const serverApp = createGatewayServer(providerManager, configStore.getApiKey());
  const port = configStore.getPort();

  gatewayServer = serverApp.listen(port, '127.0.0.1', () => {
    console.log(`[Gateway] Server running on http://127.0.0.1:${port}`);
  });
}

// Send progress updates to renderer
function sendProgress(providerId: string, message: string) {
  mainWindow?.webContents?.send('auth:progress', { providerId, message });
}

// IPC Handlers
function setupIPC(): void {
  // Config
  ipcMain.handle('config:get', () => configStore.getAll());
  ipcMain.handle('config:getPort', () => configStore.getPort());
  ipcMain.handle('config:getApiKey', () => configStore.getApiKey());
  ipcMain.handle('config:setPort', (_, port: number) => {
    configStore.setPort(port);
    if (gatewayServer) gatewayServer.close();
    const serverApp = createGatewayServer(providerManager, configStore.getApiKey());
    gatewayServer = serverApp.listen(port, '127.0.0.1');
    return true;
  });
  ipcMain.handle('config:setApiKey', (_, key: string) => {
    configStore.setApiKey(key);
    return true;
  });
  ipcMain.handle('config:regenerateApiKey', () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'fg-';
    for (let i = 0; i < 48; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
    configStore.setApiKey(key);
    return key;
  });

  // Providers
  ipcMain.handle('providers:list', () => providerManager.getAllProviderInfos());
  ipcMain.handle('providers:active', () => {
    const active: Record<string, any> = {};
    for (const [id, provider] of providerManager.getActiveProviders()) {
      active[id] = { info: provider.info };
    }
    return active;
  });

  // *** KEY: Fully automatic login ***
  ipcMain.handle('auth:autoLogin', async (_, providerId: string) => {
    if (authInProgress[providerId]) {
      return { success: false, error: 'Login already in progress for this provider' };
    }

    authInProgress[providerId] = true;
    sendProgress(providerId, 'Starting automatic login...');

    try {
      // Dynamically import the provider's auth module
      const startAutoLogin = await getAutoLoginFn(providerId);

      // This opens Chrome, navigates to login page, waits for user to login,
      // and auto-captures cookies + bearer tokens from network requests
      const credentials = await startAutoLogin((message: string) => {
        sendProgress(providerId, message);
      });

      // Validate and register
      sendProgress(providerId, 'Validating credentials...');
      const result = await providerManager.authenticateProvider(providerId, credentials);

      if (result) {
        configStore.saveProviderCredentials(providerId, credentials);
        configStore.setProviderEnabled(providerId, true);
        sendProgress(providerId, 'Connected successfully!');
        return { success: true };
      } else {
        return { success: false, error: 'Credential validation failed. Please try again.' };
      }
    } catch (err: any) {
      sendProgress(providerId, `Error: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      delete authInProgress[providerId];
    }
  });

  ipcMain.handle('providers:enable', (_, providerId: string, enabled: boolean) => {
    configStore.setProviderEnabled(providerId, enabled);
    if (!enabled) {
      providerManager.unregisterProvider(providerId);
    } else {
      const creds = configStore.getProviderCredentials(providerId);
      if (creds) providerManager.registerProvider(providerId, creds as any);
    }
    return true;
  });

  ipcMain.handle('providers:remove', (_, providerId: string) => {
    providerManager.unregisterProvider(providerId);
    configStore.removeProvider(providerId);
    return true;
  });

  // System
  ipcMain.handle('system:getStatus', async () => {
    const providers: Record<string, any> = {};
    for (const [id, provider] of providerManager.getActiveProviders()) {
      try {
        providers[id] = { healthy: await provider.isHealthy(), info: provider.info };
      } catch {
        providers[id] = { healthy: false, info: provider.info };
      }
    }
    return {
      gatewayPort: configStore.getPort(),
      gatewayApiKey: configStore.getApiKey(),
      providerCount: providerManager.getActiveProviders().size,
      providers,
    };
  });

  ipcMain.handle('system:openUrl', (_, url: string) => {
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('models:list', () => providerManager.listModels());

  // Auto-refresh sessions
  ipcMain.handle('auth:startAutoRefresh', async (_, intervalMinutes?: number) => {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    const interval = (intervalMinutes || 30) * 60 * 1000;
    autoRefreshEnabled = true;

    const refreshAll = async () => {
      const enabledProviders = configStore.getEnabledProviders();
      for (const providerId of enabledProviders) {
        if (authInProgress[providerId]) continue;
        try {
          sendProgress(providerId, 'Auto-refreshing session...');
          const startAutoLogin = await getAutoLoginFn(providerId);
          const credentials = await startAutoLogin((msg: string) => {
            console.log(`[AutoRefresh] ${providerId}: ${msg}`);
          });
          configStore.saveProviderCredentials(providerId, credentials);
          providerManager.unregisterProvider(providerId);
          providerManager.registerProvider(providerId, credentials);
          sendProgress(providerId, 'Session refreshed!');
          // Close the tab after capture
        } catch (err: any) {
          console.warn(`[AutoRefresh] Failed to refresh ${providerId}:`, err.message);
        }
      }
    };

    // Run first refresh after a short delay, then on interval
    setTimeout(refreshAll, 5000);
    autoRefreshTimer = setInterval(refreshAll, interval);

    console.log(`[AutoRefresh] Started - refreshing every ${intervalMinutes || 30} minutes`);
    return true;
  });

  ipcMain.handle('auth:stopAutoRefresh', () => {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
    autoRefreshEnabled = false;
    console.log('[AutoRefresh] Stopped');
    return true;
  });

  ipcMain.handle('auth:getAutoRefreshStatus', () => ({
    enabled: autoRefreshEnabled,
  }));
}

app.whenReady().then(async () => {
  setupIPC();
  await startGateway();
  createWindow();

  // Set macOS Dock icon
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  if (app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }
});

app.on('before-quit', async () => {
  await closeSharedBrowser();
});

app.on('window-all-closed', () => {
  if (gatewayServer) gatewayServer.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
