import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://chat2.qianwen.com';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on chat2.qianwen.com',
  },
  {
    name: 'bearer',
    label: 'Bearer Token (auto-captured)',
    type: 'bearer',
    required: false,
    description: 'Automatically captured from Qwen China API network requests',
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
 * Start automatic Qwen China (千问) login.
    * Opens Chrome, navigates to chat2.qianwen.com, waits for user to log in,
 * then auto-captures cookies and bearer token from network requests.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'qwen-cn',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies, page, url) => {
      // Check for Qwen China-specific session cookies
      const qwenCnSessionCookies = cookies.filter(c =>
        c.name === 'token' ||
        c.name === 'session' ||
        c.name === 'auth_token' ||
        c.name.startsWith('qwen_') ||
        c.name.startsWith('_tb_token_') ||
        c.name.startsWith('EGG_SESS') ||
        c.name.startsWith('LOGIN_') ||
        c.name.startsWith('ALI_') ||
        (c.value.length > 50 && c.name.length > 3)
      );
      // Must be on qianwen.com or chat2.qianwen.com domain
      const currentHost = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
      const onCorrectDomain = currentHost.includes('qianwen.com');
      return qwenCnSessionCookies.length >= 1 && onCorrectDomain;
    },
    captureExtra: async (page) => {
      // Capture any bearer tokens from cookies or local storage
      const extra: Record<string, string> = {};
      try {
        const token = await page.evaluate(() => {
          return localStorage.getItem('token') || localStorage.getItem('access_token') || '';
        });
        if (token) extra.bearer = token;
      } catch {}
      return extra;
    },
    onProgress,
  });
}

/**
 * Validate that the provided credentials can reach the Qwen China API.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  try {
    const cookie = credentials.cookie || '';
    if (cookie.length < 10) return false;

    const res = await fetch('https://chat2.qianwen.com/api/models', {
      method: 'GET',
      headers: {
        Cookie: cookie,
        'User-Agent': (credentials.userAgent as string) || 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(10_000),
    });
    return res.status !== 401;
  } catch {
    return false;
  }
}
