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
 * Validate credentials - lenient check.
 * For free web providers, we just check if cookies exist.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  const cookie = credentials.cookie || '';
  return cookie.length > 20;
}
