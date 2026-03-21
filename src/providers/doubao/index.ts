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
import { doubaoChat, doubaoChatStream } from './client';

export const DOUBAO_INFO: ProviderInfo = {
  id: 'doubao',
  name: 'Doubao (ByteDance)',
  url: 'https://www.doubao.com/chat/',
  authFields: AUTH_FIELDS,
  models: [
    {
      id: 'doubao-seed-2.0',
      name: 'Doubao Seed 2.0',
      contextWindow: 128_000,
      maxTokens: 16_384,
      reasoning: true,
    },
    {
      id: 'doubao-pro-256k',
      name: 'Doubao Pro 256K',
      contextWindow: 256_000,
      maxTokens: 32_768,
    },
    {
      id: 'doubao-lite',
      name: 'Doubao Lite',
      contextWindow: 32_000,
      maxTokens: 8_192,
    },
  ],
};

export class DoubaoProvider implements AIProvider {
  readonly info: ProviderInfo = DOUBAO_INFO;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    return doubaoChat(this.credentials, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    return doubaoChatStream(this.credentials, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    return validateCredentials(this.credentials);
  }
}
