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
import { geminiChat, geminiChatStream } from './client';

export const GEMINI_INFO: ProviderInfo = {
  id: 'gemini',
  name: 'Gemini Web',
  url: 'https://gemini.google.com/app',
  authFields: AUTH_FIELDS,
  models: [
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      contextWindow: 1_000_000,
      maxTokens: 65_536,
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      contextWindow: 1_000_000,
      maxTokens: 8_192,
    },
    {
      id: 'gemini-2.0-pro',
      name: 'Gemini 2.0 Pro',
      contextWindow: 1_000_000,
      maxTokens: 32_768,
    },
  ],
};

export class GeminiProvider implements AIProvider {
  readonly info: ProviderInfo = GEMINI_INFO;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    return geminiChat(this.credentials, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    return geminiChatStream(this.credentials, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    return validateCredentials(this.credentials);
  }
}
