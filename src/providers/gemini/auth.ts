import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://gemini.google.com/app';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on gemini.google.com',
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
 * Start automatic Gemini login.
 * Opens Chrome, navigates to gemini.google.com/app, waits for user to log in,
 * then auto-captures cookies containing __Secure-1PSID.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'gemini',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      return cookies.some((c) => c.name === '__Secure-1PSID' && c.value.length > 10);
    },
    onProgress,
  });
}

/**
 * Validate that the provided credentials contain the required Gemini cookies.
 * Checks for __Secure-1PSID presence in the cookie string.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  try {
    const cookie = credentials.cookie || '';
    if (!cookie.includes('__Secure-1PSID')) {
      return false;
    }

    const res = await fetch(PROVIDER_URL, {
      method: 'GET',
      headers: {
        Cookie: cookie,
        'User-Agent': (credentials.userAgent as string) || 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}
