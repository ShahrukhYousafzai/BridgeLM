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
import { chatGlmIntl, chatStreamGlmIntl } from './client';

const MODELS: ProviderModel[] = [
  {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    contextWindow: 128_000,
    maxTokens: 16_384,
  },
  {
    id: 'glm-4-think',
    name: 'GLM-4 Think',
    contextWindow: 128_000,
    maxTokens: 16_384,
    reasoning: true,
  },
];

export class GLMIntlProvider implements AIProvider {
  private credentials: ProviderCredentials;

  readonly info: ProviderInfo = {
    id: 'glm-intl',
    name: 'GLM International',
    models: MODELS,
    url: 'https://chat.z.ai',
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
    return chatGlmIntl(this.credentials!, params);
  }

  async chatStream(params: ChatParams, callback: StreamCallback): Promise<void> {
    this.ensureAuthenticated();
    return chatStreamGlmIntl(this.credentials!, params, callback);
  }

  async isHealthy(): Promise<boolean> {
    if (!this.credentials?.cookie) return false;
    return validateCredentials(this.credentials);
  }

  private ensureAuthenticated(): void {
    if (!this.credentials?.cookie) {
      throw new Error('GLM International provider not authenticated. Set credentials first.');
    }
  }
}

export { AUTH_FIELDS } from './auth';
export { chatGlmIntl, chatStreamGlmIntl } from './client';
