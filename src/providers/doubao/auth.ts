import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://www.doubao.com/chat/';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on doubao.com',
  },
  {
    name: 'bearer',
    label: 'Bearer Token (auto-captured)',
    type: 'bearer',
    required: false,
    description: 'Automatically captured from Doubao API network requests',
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
 * Start automatic Doubao (ByteDance) login.
 * Opens Chrome, navigates to doubao.com, waits for user to log in,
 * then auto-captures cookies and bearer token from network requests.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'doubao',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      return cookies.length > 2;
    },
    onProgress,
  });
}

/**
 * Validate that the provided credentials can reach the Doubao API.
 * Sends a minimal request and checks for a non-401 response.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  try {
    const cookie = credentials.cookie || '';
    if (cookie.length < 10) return false;

    const res = await fetch('https://www.doubao.com/api/models', {
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
