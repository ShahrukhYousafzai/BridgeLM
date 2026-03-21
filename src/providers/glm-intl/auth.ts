import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://chat.z.ai';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on chat.z.ai',
  },
  {
    name: 'bearer',
    label: 'Bearer Token (auto-captured)',
    type: 'bearer',
    required: false,
    description: 'Automatically captured from GLM International API network requests',
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
 * Start automatic GLM International login.
 * Opens Chrome, navigates to chat.z.ai, waits for user to log in,
 * then auto-captures cookies and bearer token from network requests.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'glm-intl',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      return cookies.length > 2;
    },
    onProgress,
  });
}

/**
 * Validate that the provided credentials can reach the GLM International API.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  try {
    const cookie = credentials.cookie || '';
    if (cookie.length < 10) return false;

    const headers: Record<string, string> = {
      Cookie: cookie,
      'User-Agent': (credentials.userAgent as string) || 'Mozilla/5.0',
    };
    if (credentials.bearer) {
      headers['Authorization'] = `Bearer ${credentials.bearer}`;
    }

    const res = await fetch('https://chat.z.ai/api/user/info', {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    return res.status !== 401;
  } catch {
    return false;
  }
}
