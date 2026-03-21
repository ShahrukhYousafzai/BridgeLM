import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://grok.com';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on grok.com',
  },
  {
    name: 'bearer',
    label: 'Bearer Token (auto-captured)',
    type: 'bearer',
    required: false,
    description: 'Automatically captured from grok.com API requests',
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
 * Start automatic Grok login.
 * Opens Chrome, navigates to grok.com, waits for user to log in,
 * then auto-captures cookies and bearer token.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'grok',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      return (
        cookieStr.includes('auth_token=') ||
        cookieStr.includes('ct0=') ||
        cookies.length > 3
      );
    },
    onProgress,
  });
}

/**
 * Validate that the provided credentials can reach the Grok API.
 * Simply checks that a cookie is present.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  try {
    const cookie = credentials.cookie || '';
    return cookie.trim().length > 10;
  } catch {
    return false;
  }
}
