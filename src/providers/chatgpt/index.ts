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
import { chatgptChat, chatgptChatStream } from './client';

export const CHATGPT_INFO: ProviderInfo = {
  id: 'chatgpt',
  name: 'ChatGPT Web',
  url: 'https://chatgpt.com',
  authFields: AUTH_FIELDS,
  models: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128_000,
      maxTokens: 16_384,
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      contextWindow: 128_000,
      maxTokens: 4_096,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      contextWindow: 128_000,
      maxTokens: 16_384,
    },
  ],
};

export class ChatGPTProvider implements AIProvider {
  readonly info: ProviderInfo = CHATGPT_INFO;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    return chatgptChat(this.credentials, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    return chatgptChatStream(this.credentials, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    return validateCredentials(this.credentials);
  }
}
