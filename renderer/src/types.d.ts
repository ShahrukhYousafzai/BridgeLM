// Type declarations for Electron preload API
declare global {
  interface Window {
    api: {
      // Config
      getConfig: () => Promise<any>;
      getPort: () => Promise<number>;
      getApiKey: () => Promise<string>;
      setPort: (port: number) => Promise<boolean>;
      setApiKey: (key: string) => Promise<boolean>;
      regenerateApiKey: () => Promise<string>;

      // Providers
      listProviders: () => Promise<ProviderInfo[]>;
      activeProviders: () => Promise<Record<string, any>>;
      enableProvider: (id: string, enabled: boolean) => Promise<boolean>;
      removeProvider: (id: string) => Promise<boolean>;

      // *** Fully automatic login ***
      autoLogin: (providerId: string) => Promise<{ success: boolean; error?: string }>;
      onAuthProgress: (callback: (data: { providerId: string; message: string }) => void) => () => void;

      // System
      getStatus: () => Promise<SystemStatus>;
      openUrl: (url: string) => Promise<boolean>;

      // Models
      listModels: () => Promise<any[]>;
    };
  }
}

export interface ProviderInfo {
  id: string;
  name: string;
  url: string;
  models: ModelInfo[];
  authFields: AuthField[];
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
  multimodal?: boolean;
}

export interface AuthField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface SystemStatus {
  gatewayPort: number;
  gatewayApiKey: string;
  providerCount: number;
  providers: Record<string, { healthy: boolean; info: ProviderInfo }>;
}

export {};
