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
import { claudeChat, claudeChatStream } from './client';

export const CLAUDE_INFO: ProviderInfo = {
  id: 'claude',
  name: 'Claude Web',
  url: 'https://claude.ai',
  authFields: AUTH_FIELDS,
  models: [
    {
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      contextWindow: 195_000,
      maxTokens: 8_192,
    },
    {
      id: 'claude-opus-4-6',
      name: 'Claude Opus 4.6',
      contextWindow: 195_000,
      maxTokens: 16_384,
      reasoning: true,
    },
    {
      id: 'claude-haiku-4-6',
      name: 'Claude Haiku 4.6',
      contextWindow: 195_000,
      maxTokens: 8_192,
    },
  ],
};

export class ClaudeProvider implements AIProvider {
  readonly info: ProviderInfo = CLAUDE_INFO;
  private credentials: ProviderCredentials;

  constructor(credentials: ProviderCredentials) {
    this.credentials = credentials;
  }

  async authenticate(params: AuthParams): Promise<ProviderCredentials> {
    return startAutoLogin(params.onProgress);
  }

  async chat(params: ChatParams): Promise<ChatCompletionResponse> {
    return claudeChat(this.credentials, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    return claudeChatStream(this.credentials, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    return validateCredentials(this.credentials);
  }
}
