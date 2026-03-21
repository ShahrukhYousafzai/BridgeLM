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
import { chatQwenCn, chatStreamQwenCn } from './client';

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
];

export class QwenCNProvider implements AIProvider {
  private credentials: ProviderCredentials;

  readonly info: ProviderInfo = {
    id: 'qwen-cn',
    name: 'Qwen China (千问)',
    models: MODELS,
    url: 'https://www.qianwen.com',
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
    return chatQwenCn(this.credentials!, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    this.ensureAuthenticated();
    return chatStreamQwenCn(this.credentials!, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    if (!this.credentials?.cookie) return false;
    return validateCredentials(this.credentials);
  }

  private ensureAuthenticated(): void {
    if (!this.credentials?.cookie) {
      throw new Error('Qwen China provider not authenticated. Set credentials first.');
    }
  }
}

export { AUTH_FIELDS } from './auth';
export { chatQwenCn, chatStreamQwenCn } from './client';
