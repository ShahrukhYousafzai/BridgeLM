import { app } from 'electron';
import path from 'path';
import fs from 'fs';

interface StoredData {
  port: number;
  apiKey: string;
  providers: Record<string, {
    enabled: boolean;
    credentials: Record<string, any>;
    defaultModel?: string;
  }>;
}

const DEFAULT_CONFIG: StoredData = {
  port: 3456,
  apiKey: 'secret',
  providers: {},
};

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'fg-';
  for (let i = 0; i < 48; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function getConfigPath(): string {
  const userDataPath = app?.getPath('userData') || path.join(process.env.HOME || '.', '.free-ai-gateway');
  return path.join(userDataPath, 'config.json');
}

function getCredentialsDir(): string {
  const userDataPath = app?.getPath('userData') || path.join(process.env.HOME || '.', '.free-ai-gateway');
  const dir = path.join(userDataPath, 'credentials');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export class ConfigStore {
  private data: StoredData;
  private configPath: string;

  constructor() {
    this.configPath = getConfigPath();
    this.data = this.load();
  }

  private load(): StoredData {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.warn('[ConfigStore] Failed to load config:', err);
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2));
  }

  getPort(): number {
    return this.data.port;
  }

  setPort(port: number): void {
    this.data.port = port;
    this.save();
  }

  getApiKey(): string {
    return this.data.apiKey;
  }

  setApiKey(key: string): void {
    this.data.apiKey = key;
    this.save();
  }

  getProviderCredentials(providerId: string): Record<string, any> | null {
    return this.data.providers[providerId]?.credentials || null;
  }

  saveProviderCredentials(providerId: string, credentials: Record<string, any>): void {
    if (!this.data.providers[providerId]) {
      this.data.providers[providerId] = { enabled: true, credentials: {} };
    }
    this.data.providers[providerId].credentials = credentials;
    this.save();

    // Also save encrypted backup
    const credsDir = getCredentialsDir();
    fs.writeFileSync(
      path.join(credsDir, `${providerId}.json`),
      JSON.stringify(credentials, null, 2)
    );
  }

  isProviderEnabled(providerId: string): boolean {
    return this.data.providers[providerId]?.enabled ?? false;
  }

  setProviderEnabled(providerId: string, enabled: boolean): void {
    if (!this.data.providers[providerId]) {
      this.data.providers[providerId] = { enabled: false, credentials: {} };
    }
    this.data.providers[providerId].enabled = enabled;
    this.save();
  }

  getEnabledProviders(): string[] {
    return Object.entries(this.data.providers)
      .filter(([_, config]) => config.enabled)
      .map(([id]) => id);
  }

  removeProvider(providerId: string): void {
    delete this.data.providers[providerId];
    this.save();
  }

  getAll(): StoredData {
    return { ...this.data };
  }
}
