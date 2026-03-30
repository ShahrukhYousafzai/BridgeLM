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
 * Validate credentials - check for required Gemini cookies.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  const cookie = credentials.cookie || '';
  // Gemini requires __Secure-1PSID cookie
  return cookie.includes('__Secure-1PSID') || cookie.length > 20;
}
