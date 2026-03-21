import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://claude.ai';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'sessionKey',
    label: 'Session Key (auto-captured)',
    type: 'sessionKey',
    required: true,
    description: 'Automatically captured from claude.ai cookies (sk-ant-sid*)',
  },
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on claude.ai',
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
 * Start automatic Claude login.
 * Opens Chrome, navigates to claude.ai, waits for user to log in,
 * then auto-captures cookies and extracts the sessionKey.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'claude',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      const sessionKeyCookie = cookies.find(
        (c: { name: string; value: string }) => c.name === 'sessionKey' && c.value.startsWith('sk-ant-sid')
      );
      return !!sessionKeyCookie;
    },
    captureExtra: async (_page, context) => {
      const cookies = await context.cookies(['claude.ai']);
      const sessionKeyCookie = cookies.find((c: { name: string; value: string }) => c.name === 'sessionKey');
      return {
        sessionKey: sessionKeyCookie?.value || '',
      };
    },
    onProgress,
  });
}

/**
 * Validate that the provided credentials can reach the Claude API.
 * Sends a GET request to /api/organizations and checks for a non-401 response.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  try {
    const cookie = credentials.cookie || '';
    if (cookie.length < 10) return false;

    const res = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      headers: {
        Cookie: cookie,
        'User-Agent': (credentials.userAgent as string) || 'Mozilla/5.0',
        'anthropic-client-platform': 'web_claude_ai',
        Origin: PROVIDER_URL,
        Referer: `${PROVIDER_URL}/`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    return res.status !== 401;
  } catch {
    return false;
  }
}
