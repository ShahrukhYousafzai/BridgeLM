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
    'label': 'User Agent (auto-captured)',
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
 * Validate that the provided credentials can reach the Kimi API.
 * Checks for kimi-auth cookie and validates against a simple endpoint.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  try {
    const cookie = credentials.cookie || '';
    if (cookie.length < 10) return false;

    // Check if kimi-auth exists in cookies
    const hasKimiAuth = /kimi-auth=[^;]+/.test(cookie);
    if (!hasKimiAuth) {
      console.warn('[Kimi] kimi-auth cookie not found - may need to re-login');
    }

    // Try to validate by making a request to the API
    const kimiAuth = cookie.match(/kimi-auth=([^;]+)/)?.[1];
    if (!kimiAuth) return false;

    const headers: Record<string, string> = {
      'Content-Type': 'application/connect+json',
      'Connect-Protocol-Version': '1',
      'Origin': PROVIDER_URL,
      'Referer': `${PROVIDER_URL}/`,
      'Authorization': `Bearer ${kimiAuth}`,
      'User-Agent': (credentials.userAgent as string) || 'Mozilla/5.0',
    };

    // Make a minimal request to validate the auth token
    const res = await fetch(`${PROVIDER_URL}/apiv2/kimi.gateway.chat.v1.ChatService/HealthCheck`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    // Any response (even 404) means the auth is working
    // Only 401/403 means auth is invalid
    return res.status !== 401 && res.status !== 403;
  } catch {
    // On error, assume credentials might be valid (network issues shouldn't block)
    return true;
  }
}
