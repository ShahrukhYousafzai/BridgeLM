import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

// Use www.kimi.com to match the official web interface
export const PROVIDER_URL = 'https://www.kimi.com';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on www.kimi.com',
  },
  {
    name: 'bearer',
    label: 'Bearer Token (unused)',
    type: 'bearer',
    required: false,
    description: 'Not used - Kimi uses kimi-auth cookie',
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
 * Start automatic Kimi (Moonshot) login.
 * Opens Chrome, navigates to www.kimi.com, waits for user to log in,
 * then auto-captures cookies.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'kimi',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      // Check for kimi-auth cookie specifically, or significant session cookies
      const hasKimiAuth = cookies.some(c => c.name === 'kimi-auth');
      const hasAccessToken = cookies.some(c => c.name === 'access_token');
      const hasSessionCookie = cookies.some(c =>
        c.value.length > 100 ||
        ['kimi-auth', 'access_token', 'sessionKey', 'token'].includes(c.name)
      );
      return hasKimiAuth || hasAccessToken || hasSessionCookie || cookies.length >= 5;
    },
    onProgress,
  });
}

/**
 * Validate credentials - lenient check.
 * For free web providers, we just check if cookies exist.
 * Endpoint validation often fails due to CORS or missing routes.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  const cookie = credentials.cookie || '';
  // Just check if we have meaningful cookies
  const hasKimiAuth = /kimi-auth=[^;]+/.test(cookie);
  const hasCookies = cookie.length > 20;
  return hasKimiAuth || hasCookies;
}
