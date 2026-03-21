import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  getPort: () => ipcRenderer.invoke('config:getPort'),
  getApiKey: () => ipcRenderer.invoke('config:getApiKey'),
  setPort: (port: number) => ipcRenderer.invoke('config:setPort', port),
  setApiKey: (key: string) => ipcRenderer.invoke('config:setApiKey', key),
  regenerateApiKey: () => ipcRenderer.invoke('config:regenerateApiKey'),

  // Providers
  listProviders: () => ipcRenderer.invoke('providers:list'),
  activeProviders: () => ipcRenderer.invoke('providers:active'),
  enableProvider: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('providers:enable', id, enabled),
  removeProvider: (id: string) => ipcRenderer.invoke('providers:remove', id),

  // *** Fully automatic login ***
  autoLogin: (providerId: string) => ipcRenderer.invoke('auth:autoLogin', providerId),

  // Listen for login progress updates
  onAuthProgress: (callback: (data: { providerId: string; message: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('auth:progress', handler);
    return () => ipcRenderer.removeListener('auth:progress', handler);
  },

  // System
  getStatus: () => ipcRenderer.invoke('system:getStatus'),
  openUrl: (url: string) => ipcRenderer.invoke('system:openUrl', url),

  // Models
  listModels: () => ipcRenderer.invoke('models:list'),

  // Auto-refresh sessions
  startAutoRefresh: (intervalMinutes?: number) => ipcRenderer.invoke('auth:startAutoRefresh', intervalMinutes),
  stopAutoRefresh: () => ipcRenderer.invoke('auth:stopAutoRefresh'),
  getAutoRefreshStatus: () => ipcRenderer.invoke('auth:getAutoRefreshStatus'),
});
