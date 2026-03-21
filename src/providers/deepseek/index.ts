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
import { deepseekChat, deepseekChatStream } from './client';

export const DEEPSEEK_INFO: ProviderInfo = {
  id: 'deepseek',
  name: 'DeepSeek Web',
  url: 'https://chat.deepseek.com',
  authFields: AUTH_FIELDS,
  models: [
    {
      id: 'deepseek-chat',
      name: 'DeepSeek V3 (Chat)',
      contextWindow: 64_000,
      maxTokens: 8_192,
    },
    {
      id: 'deepseek-reasoner',
      name: 'DeepSeek R1 (Reasoner)',
      contextWindow: 64_000,
      maxTokens: 8_192,
      reasoning: true,
    },
  ],
};

export class DeepSeekProvider implements AIProvider {
  readonly info: ProviderInfo = DEEPSEEK_INFO;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    return deepseekChat(this.credentials, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    return deepseekChatStream(this.credentials, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    return validateCredentials(this.credentials);
  }
}
