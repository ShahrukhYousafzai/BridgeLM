import type {
  AIProvider,
  ProviderCredentials,
  ProviderInfo,
  AuthParams,
  ChatParams,
  ChatCompletionResponse,
  StreamCallback,
} from '../../gateway/types';
import { AUTH_FIELDS, startAutoLogin, validateCredentials } from './auth';
import { kimiChat, kimiChatStream } from './client';

export const KIMI_INFO: ProviderInfo = {
  id: 'kimi',
  name: 'Kimi (Moonshot)',
  url: 'https://www.kimi.com',
  authFields: AUTH_FIELDS,
  models: [
    {
      id: 'kimi-latest',
      name: 'Kimi Latest',
      contextWindow: 128_000,
      maxTokens: 16_384,
    },
    {
      id: 'moonshot-v1-8k',
      name: 'Moonshot v1 8K',
      contextWindow: 8_000,
      maxTokens: 4_096,
    },
    {
      id: 'moonshot-v1-32k',
      name: 'Moonshot v1 32K',
      contextWindow: 32_000,
      maxTokens: 8_192,
    },
    {
      id: 'moonshot-v1-128k',
      name: 'Moonshot v1 128K',
      contextWindow: 128_000,
      maxTokens: 16_384,
    },
  ],
};

export class KimiProvider implements AIProvider {
  readonly info: ProviderInfo = KIMI_INFO;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    return kimiChat(this.credentials, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    return kimiChatStream(this.credentials, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    return validateCredentials(this.credentials);
  }
}
