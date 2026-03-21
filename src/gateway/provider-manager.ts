import { EventEmitter } from 'events';
import type { AIProvider, ProviderCredentials, ProviderConfig, ChatParams, ChatCompletionResponse, StreamCallback, ProviderInfo } from './types';

// Import all provider classes
import { DeepSeekProvider } from '../providers/deepseek/index';
import { ClaudeProvider } from '../providers/claude/index';
import { ChatGPTProvider } from '../providers/chatgpt/index';
import { GeminiProvider } from '../providers/gemini/index';
import { GrokProvider } from '../providers/grok/index';
import { KimiProvider } from '../providers/kimi/index';
import { QwenProvider } from '../providers/qwen/index';
import { QwenCNProvider } from '../providers/qwen-cn/index';
import { GLMProvider } from '../providers/glm/index';
import { GLMIntlProvider } from '../providers/glm-intl/index';
import { DoubaoProvider } from '../providers/doubao/index';

const PROVIDER_CLASSES: Record<string, new (credentials: ProviderCredentials) => AIProvider> = {
  'deepseek': DeepSeekProvider,
  'claude': ClaudeProvider,
  'chatgpt': ChatGPTProvider,
  'gemini': GeminiProvider,
  'grok': GrokProvider,
  'kimi': KimiProvider,
  'qwen': QwenProvider,
  'qwen-cn': QwenCNProvider,
  'glm': GLMProvider,
  'glm-intl': GLMIntlProvider,
  'doubao': DoubaoProvider,
};

export class ProviderManager extends EventEmitter {
  private providers: Map<string, AIProvider> = new Map();
  private configs: Map<string, ProviderConfig> = new Map();

  getAllProviderInfos(): ProviderInfo[] {
    const results: ProviderInfo[] = [];
    for (const [id, Cls] of Object.entries(PROVIDER_CLASSES)) {
      try {
        const instance = new Cls({ cookie: '', userAgent: '' } as any);
        results.push(instance.info);
      } catch (err: any) {
        console.warn(`[ProviderManager] Failed to init ${id}:`, err.message);
      }
    }
    console.log(`[ProviderManager] Found ${results.length} providers:`, results.map(r => r.id).join(', '));
    return results;
  }

  getProviderInfo(id: string): ProviderInfo | undefined {
    const Cls = PROVIDER_CLASSES[id];
    if (!Cls) return undefined;
    const instance = new Cls({ cookie: '', userAgent: '' } as any);
    return instance.info;
  }

  registerProvider(id: string, credentials: ProviderCredentials): AIProvider {
    const Cls = PROVIDER_CLASSES[id];
    if (!Cls) throw new Error(`Unknown provider: ${id}`);
    const instance = new Cls(credentials);
    this.providers.set(id, instance);
    this.configs.set(id, { enabled: true, credentials });
    this.emit('provider-registered', id);
    return instance;
  }

  unregisterProvider(id: string): void {
    this.providers.delete(id);
    this.configs.delete(id);
    this.emit('provider-unregistered', id);
  }

  getProvider(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  getActiveProviders(): Map<string, AIProvider> {
    return this.providers;
  }

  // Resolve model string like "deepseek-chat" to provider + model
  resolveModel(modelString: string): { provider: AIProvider; providerId: string; modelId: string } | null {
    // Format: "provider/model" or just "model"
    if (modelString.includes('/')) {
      const [providerId, modelId] = modelString.split('/');
      const provider = this.providers.get(providerId);
      if (provider) return { provider, providerId, modelId };
    }

    // Search all providers for matching model
    for (const [providerId, provider] of this.providers) {
      const model = provider.info.models.find(m => m.id === modelString);
      if (model) return { provider, providerId, modelId: model.id };
    }

    return null;
  }

  // Get all available models in OpenAI format
  listModels(): Array<{ id: string; object: string; created: number; owned_by: string }> {
    const models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
    const now = Math.floor(Date.now() / 1000);

    for (const [providerId, provider] of this.providers) {
      for (const model of provider.info.models) {
        models.push({
          id: `${providerId}/${model.id}`,
          object: 'model',
          created: now,
          owned_by: providerId,
        });
      }
    }

    return models;
  }

  async authenticateProvider(
    providerId: string,
    credentials: ProviderCredentials
  ): Promise<boolean> {
    const Cls = PROVIDER_CLASSES[providerId];
    if (!Cls) throw new Error(`Unknown provider: ${providerId}`);
    
    const instance = new Cls(credentials);
    try {
      const healthy = await instance.isHealthy();
      if (healthy) {
        this.registerProvider(providerId, credentials);
      }
      return healthy;
    } catch {
      return false;
    }
  }
}
