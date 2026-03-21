import type {
  AIProvider,
  ProviderInfo,
  ProviderCredentials,
  AuthParams,
  ChatParams,
  ChatCompletionResponse,
  StreamCallback,
  ProviderModel,
} from '../../gateway/types';
import { AUTH_FIELDS, startAutoLogin, validateCredentials } from './auth';
import { chatQwen, chatStreamQwen } from './client';

const MODELS: ProviderModel[] = [
  {
    id: 'qwen3.5-plus',
    name: 'Qwen 3.5 Plus',
    contextWindow: 131_072,
    maxTokens: 16_384,
    reasoning: true,
  },
  {
    id: 'qwen3.5-turbo',
    name: 'Qwen 3.5 Turbo',
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    contextWindow: 32_768,
    maxTokens: 8_192,
    reasoning: true,
  },
  {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    contextWindow: 131_072,
    maxTokens: 16_384,
  },
];

export class QwenProvider implements AIProvider {
  private credentials: ProviderCredentials;

  readonly info: ProviderInfo = {
    id: 'qwen',
    name: 'Qwen International',
    models: MODELS,
    url: 'https://chat.qwen.ai',
    authFields: AUTH_FIELDS,
  };

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  setCredentials(credentials: ProviderCredentials): void {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    this.ensureAuthenticated();
    return chatQwen(this.credentials!, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    this.ensureAuthenticated();
    return chatStreamQwen(this.credentials!, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    if (!this.credentials?.cookie) return false;
    return validateCredentials(this.credentials);
  }

  private ensureAuthenticated(): void {
    if (!this.credentials?.cookie) {
      throw new Error('Qwen provider not authenticated. Set credentials first.');
    }
  }
}

export { AUTH_FIELDS } from './auth';
export { chatQwen, chatStreamQwen } from './client';
