import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://chat.qwen.ai';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on chat.qwen.ai',
  },
  {
    name: 'bearer',
    label: 'Bearer Token (auto-captured)',
    type: 'bearer',
    required: false,
    description: 'Automatically captured from Qwen API network requests',
  },
  {
    name: 'userAgent',
    label: 'User Agent (auto-captured)',
    type: 'text',
    required: false,
    description: 'Automatically captured from the browser session',
  },
];

/**
 * Start automatic Qwen International login.
 * Opens Chrome, navigates to chat.qwen.ai, waits for user to log in,
 * then auto-captures cookies and bearer token from network requests.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'qwen',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies, page, url) => {
      // Check for Qwen-specific session cookies on chat.qwen.ai domain
      const qwenSessionCookies = cookies.filter(c =>
        c.name === 'token' ||
        c.name === 'session' ||
        c.name === 'auth_token' ||
        c.name.startsWith('qwen_') ||
        c.name.startsWith('_tb_token_') ||
        c.name.startsWith('EGG_SESS') ||
        (c.value.length > 50 && c.name.length > 3)
      );
      // Must have meaningful cookies AND be on chat.qwen.ai (not redirected to qianwen.com)
      const currentHost = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
      const onCorrectDomain = currentHost.includes('chat.qwen.ai') || currentHost.includes('qwen.ai');
      return qwenSessionCookies.length >= 1 && onCorrectDomain;
    },
    onProgress,
  });
}

/**
 * Validate credentials - lenient check.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  const cookie = credentials.cookie || '';
  return cookie.length > 20;
}
