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
import { grokChat, grokChatStream } from './client';

export const GROK_INFO: ProviderInfo = {
  id: 'grok',
  name: 'Grok (xAI)',
  url: 'https://grok.com',
  authFields: AUTH_FIELDS,
  models: [
    {
      id: 'grok-3',
      name: 'Grok 3',
      contextWindow: 128_000,
      maxTokens: 16_384,
    },
    {
      id: 'grok-3-mini',
      name: 'Grok 3 Mini',
      contextWindow: 128_000,
      maxTokens: 16_384,
    },
  ],
};

export class GrokProvider implements AIProvider {
  readonly info: ProviderInfo = GROK_INFO;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    return grokChat(this.credentials, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    return grokChatStream(this.credentials, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    return validateCredentials(this.credentials);
  }
}
